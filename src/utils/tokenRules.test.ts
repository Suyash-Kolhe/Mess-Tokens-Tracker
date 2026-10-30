import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONTHLY_STARTING_TOKENS,
  MAX_ROLLOVER_TOKENS,
  FORECAST_WARNING_THRESHOLD,
  calculateMealCost,
  calculateSkipRefund,
  calculateMonthlyRollover,
  applyMonthlyRollover,
  calculateTomorrowForecast,
  buildMonthlyBalanceTrendSeries,
  createInitialStudentAccount,
  validateAndApplyMealDeduction,
  validateAndApplyMealSkip,
  computeMonthlyBillingSummary,
} from './tokenRules';

test('student starts the month with 60 tokens, 0 rollover, 0 used, and 0 refunded', () => {
  const account = createInitialStudentAccount();
  assert.equal(account.monthlyAllowance, 60);
  assert.equal(account.rolloverTokens, 0);
  assert.equal(account.tokenBalance, MONTHLY_STARTING_TOKENS);
  assert.equal(account.tokensUsed, 0);
  assert.equal(account.tokensRefunded, 0);
});

test('regular and guest meal token costs match specification', () => {
  assert.deepEqual(calculateMealCost('breakfast', false), { baseCost: 1, tokenCost: 1 });
  assert.deepEqual(calculateMealCost('lunch', false), { baseCost: 2, tokenCost: 2 });
  assert.deepEqual(calculateMealCost('dinner', false), { baseCost: 2, tokenCost: 2 });
  assert.deepEqual(calculateMealCost('breakfast', true), { baseCost: 1, tokenCost: 2 });
  assert.deepEqual(calculateMealCost('lunch', true), { baseCost: 2, tokenCost: 4 });
  assert.deepEqual(calculateMealCost('dinner', true), { baseCost: 2, tokenCost: 4 });
});

test('skip refund is half the meal base tokens rounded down: floor(baseCost / 2)', () => {
  assert.deepEqual(calculateSkipRefund('breakfast'), { baseCost: 1, refundTokens: 0 });
  assert.deepEqual(calculateSkipRefund('lunch'), { baseCost: 2, refundTokens: 1 });
  assert.deepEqual(calculateSkipRefund('dinner'), { baseCost: 2, refundTokens: 1 });
});

test('valid skip before 8 PM previous day succeeds and refunds floor(baseCost / 2) tokens', () => {
  let account = createInitialStudentAccount();
  const mealRes = validateAndApplyMealDeduction(account, {
    mealType: 'dinner',
    isGuestMeal: true,
    diningCounter: 'Central Commons',
  });
  assert.equal(mealRes.ok, true);
  if (!mealRes.ok) return;
  account = mealRes.updatedAccount;
  assert.equal(account.tokenBalance, 56);

  const skipLunchRes = validateAndApplyMealSkip(account, {
    mealType: 'lunch',
    targetMealDate: '2026-10-30',
    simulatedClock: '2026-10-29T18:30',
    notes: 'Field trip tomorrow afternoon',
  });

  assert.equal(skipLunchRes.ok, true);
  if (skipLunchRes.ok) {
    assert.equal(skipLunchRes.refundTokens, 1);
    assert.equal(skipLunchRes.updatedAccount.tokenBalance, 57);
    assert.equal(skipLunchRes.updatedAccount.tokensRefunded, 1);
    assert.equal(skipLunchRes.updatedAccount.skipsLoggedCount, 1);
    assert.equal(skipLunchRes.logEntry.entryKind, 'skip');
    assert.equal(skipLunchRes.logEntry.balanceBefore, 56);
    assert.equal(skipLunchRes.logEntry.balanceAfter, 57);
  }
});

test('skip logged at or after 8 PM previous day is strictly blocked', () => {
  const account = createInitialStudentAccount();

  const latePrevEvening = validateAndApplyMealSkip(account, {
    mealType: 'dinner',
    targetMealDate: '2026-10-30',
    simulatedClock: '2026-10-29T20:15',
  });
  assert.equal(latePrevEvening.ok, false);
  if (!latePrevEvening.ok) {
    assert.equal(latePrevEvening.code, 'SKIP_DEADLINE_PASSED');
    assert.match(latePrevEvening.message, /8:00 PM/i);
  }
});

test('unused tokens roll over to next month capped at 10 tokens', () => {
  const overCap = calculateMonthlyRollover(24);
  assert.equal(overCap.rolloverTokens, MAX_ROLLOVER_TOKENS);
  assert.equal(overCap.forfeitedTokens, 14);
  assert.equal(overCap.nextMonthOpeningAllowance, 70);

  const underCap = calculateMonthlyRollover(7);
  assert.equal(underCap.rolloverTokens, 7);
  assert.equal(underCap.forfeitedTokens, 0);
  assert.equal(underCap.nextMonthOpeningAllowance, 67);

  const octAccount = {
    ...createInitialStudentAccount({ currentMonth: '2026-10' }),
    tokenBalance: 18,
    tokensUsed: 42,
  };
  const rolloverResult = applyMonthlyRollover(octAccount);
  assert.equal(rolloverResult.nextMonth, '2026-11');
  assert.equal(rolloverResult.rolloverTokens, 10);
  assert.equal(rolloverResult.updatedAccount.monthlyAllowance, 70);
  assert.equal(rolloverResult.updatedAccount.tokenBalance, 70);
});

test('admin tomorrow forecast calculates (enrolled - skipped) + guests and warns when > 120 meals', () => {
  // Case 1: 118 enrolled, 4 skipped -> 114 students attending + 12 guests = 126 meals (> 120 -> Warning!)
  const highForecast = calculateTomorrowForecast({
    forecastDate: '2026-10-30',
    enrolledStudents: 118,
    studentsSkipped: 4,
    guestMealsCount: 12,
  });
  assert.equal(highForecast.studentsAttending, 114);
  assert.equal(highForecast.totalForecastMeals, 126);
  assert.equal(highForecast.warningThreshold, FORECAST_WARNING_THRESHOLD);
  assert.equal(highForecast.exceedsCapacityThreshold, true);
  assert.equal(highForecast.mealsOverThreshold, 6);
  assert.ok(highForecast.warningMessage);
  assert.match(highForecast.warningMessage, /126 meals/i);

  // Case 2: Exactly 120 meals (110 attending + 10 guests = 120) -> No warning (only > 120 warns)
  const exactBoundary = calculateTomorrowForecast({
    forecastDate: '2026-10-30',
    enrolledStudents: 115,
    studentsSkipped: 5,
    guestMealsCount: 10,
  });
  assert.equal(exactBoundary.totalForecastMeals, 120);
  assert.equal(exactBoundary.exceedsCapacityThreshold, false);
  assert.equal(exactBoundary.warningMessage, null);
});

test('monthly balance trend series generates chronological points for Recharts LineChart', () => {
  let account = createInitialStudentAccount();
  const r1 = validateAndApplyMealDeduction(account, {
    mealType: 'lunch',
    isGuestMeal: false,
    diningCounter: 'Counter A',
  });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  account = r1.updatedAccount;

  const series = buildMonthlyBalanceTrendSeries(account, [r1.logEntry]);
  assert.equal(series.length, 2);
  assert.equal(series[0].tokenBalance, 60);
  assert.equal(series[1].tokenBalance, 58);
});
