export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type LedgerEntryKind = 'meal' | 'skip';

export const MONTHLY_STARTING_TOKENS = 60;
export const MAX_ROLLOVER_TOKENS = 10;
export const SKIP_CUTOFF_HOUR_24 = 20; // 8:00 PM previous day
export const FORECAST_WARNING_THRESHOLD = 120;

export const MEAL_BASE_COSTS: Record<MealType, number> = {
  breakfast: 1,
  lunch: 2,
  dinner: 2,
};

export const GUEST_MULTIPLIER = 2;

export const SIMULATED_CLOCK_PRESET_OPTIONS: {
  value: string;
  label: string;
  targetMealDate: string;
  description: string;
}[] = [
  {
    value: '2026-10-29T18:30',
    label: 'Oct 29, 2026 · 06:30 PM (Before 8 PM Cutoff for Oct 30)',
    targetMealDate: '2026-10-30',
    description: 'Valid window: 1h 30m before the 8:00 PM previous-day skip deadline',
  },
  {
    value: '2026-10-29T14:00',
    label: 'Oct 29, 2026 · 02:00 PM (Afternoon — Valid for Oct 30)',
    targetMealDate: '2026-10-30',
    description: 'Valid window: 6 hours before the 8:00 PM previous-day skip deadline',
  },
  {
    value: '2026-10-29T19:45',
    label: 'Oct 29, 2026 · 07:45 PM (15m Before 8 PM Cutoff for Oct 30)',
    targetMealDate: '2026-10-30',
    description: 'Valid window: Just before the 8:00 PM previous-day skip deadline',
  },
  {
    value: '2026-10-29T20:15',
    label: 'Oct 29, 2026 · 08:15 PM (Past 8 PM Cutoff for Oct 30 — Late)',
    targetMealDate: '2026-10-30',
    description: 'Blocked window: 15 minutes past the 8:00 PM previous-day cutoff',
  },
  {
    value: '2026-10-29T21:15',
    label: 'Oct 29, 2026 · 09:15 PM (Late Night Prev Day for Oct 30 — Late)',
    targetMealDate: '2026-10-30',
    description: 'Blocked window: 1h 15m past the 8:00 PM previous-day cutoff',
  },
  {
    value: '2026-10-30T08:00',
    label: 'Oct 30, 2026 · 08:00 AM (Same Day Morning for Oct 30 — Late)',
    targetMealDate: '2026-10-30',
    description: 'Blocked window: Same-day skip attempt (cutoff was Oct 29 at 8:00 PM)',
  },
  {
    value: '2026-10-30T17:00',
    label: 'Oct 30, 2026 · 05:00 PM (Before 8 PM Cutoff for Oct 31)',
    targetMealDate: '2026-10-31',
    description: 'Valid window for Oct 31 meals (cutoff Oct 30 at 8:00 PM)',
  },
];

export const MEAL_METADATA: Record<
  MealType,
  {
    label: string;
    window: string;
    baseTokens: number;
    guestTokens: number;
    skipRefundTokens: number;
    defaultCounter: string;
    menuSummary: string;
  }
> = {
  breakfast: {
    label: 'Breakfast',
    window: '07:00 – 09:30',
    baseTokens: 1,
    guestTokens: 2,
    skipRefundTokens: 0, // floor(1 / 2) = 0
    defaultCounter: 'North Hall · Morning Line A',
    menuSummary: 'Sourdough toast, farm eggs, seasonal fruit, filter coffee & masala chai',
  },
  lunch: {
    label: 'Lunch',
    window: '12:15 – 14:30',
    baseTokens: 2,
    guestTokens: 4,
    skipRefundTokens: 1, // floor(2 / 2) = 1
    defaultCounter: 'Central Commons · Thali Counter 2',
    menuSummary: 'Steamed basmati rice, yellow tadka dal, charred seasonal greens & rotis',
  },
  dinner: {
    label: 'Dinner',
    window: '19:30 – 21:45',
    baseTokens: 2,
    guestTokens: 4,
    skipRefundTokens: 1, // floor(2 / 2) = 1
    defaultCounter: 'Central Commons · Evening Grill B',
    menuSummary: 'Slow-simmered paneer/grain curry, warm parathas, soup broth & salad',
  },
};

export interface StudentAccountData {
  uid: string;
  studentId: string;
  fullName: string;
  hostelBlock: string;
  roomNumber: string;
  currentMonth: string;
  monthlyAllowance: number;
  rolloverTokens: number;
  tokenBalance: number;
  tokensUsed: number;
  tokensRefunded: number;
  mealsLoggedCount: number;
  guestMealsCount: number;
  skipsLoggedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MealLogRecord {
  id: string;
  studentUid: string;
  studentId: string;
  entryKind: LedgerEntryKind;
  mealType: MealType;
  isGuestMeal: boolean;
  baseCost: number;
  tokenCost: number;
  refundTokens: number;
  targetMealDate: string;
  balanceBefore: number;
  balanceAfter: number;
  diningCounter: string;
  notes: string;
  billingMonth: string;
  loggedAtIso: string;
}

export interface MealLogInput {
  mealType: MealType;
  isGuestMeal: boolean;
  diningCounter: string;
  targetMealDate?: string;
  notes?: string;
  timestampIso?: string;
}

export interface MealSkipInput {
  mealType: MealType;
  targetMealDate: string; // YYYY-MM-DD
  simulatedClock: string; // YYYY-MM-DDTHH:mm or ISO string
  notes?: string;
}

export type MealDeductionResult =
  | {
      ok: true;
      updatedAccount: StudentAccountData;
      logEntry: MealLogRecord;
      baseCost: number;
      tokenCost: number;
    }
  | {
      ok: false;
      code: 'OVERDRAFT_BLOCKED' | 'VALIDATION_ERROR';
      message: string;
      requiredTokens: number;
      availableTokens: number;
    };

export type MealSkipResult =
  | {
      ok: true;
      updatedAccount: StudentAccountData;
      logEntry: MealLogRecord;
      baseCost: number;
      refundTokens: number;
      cutoffFormatted: string;
      simulatedFormatted: string;
    }
  | {
      ok: false;
      code: 'SKIP_DEADLINE_PASSED' | 'DUPLICATE_SKIP' | 'VALIDATION_ERROR';
      message: string;
      cutoffFormatted: string;
      simulatedFormatted: string;
      refundTokens: number;
    };

export interface TomorrowForecastSummary {
  forecastDate: string;
  enrolledStudents: number;
  studentsSkipped: number;
  studentsAttending: number; // students who haven't skipped
  guestMealsCount: number;
  totalForecastMeals: number; // studentsAttending + guestMealsCount
  warningThreshold: number; // 120
  exceedsCapacityThreshold: boolean; // totalForecastMeals > 120
  mealsOverThreshold: number;
  warningMessage: string | null;
}

export interface BalanceTrendPoint {
  stepLabel: string;
  dateLabel: string;
  tokenBalance: number;
  openingAllowance: number;
  eventLabel: string;
}

export const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const BILLING_MONTH_REGEX = /^[0-9]{4}-[0-9]{2}$/;
export const DATE_YMD_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * Pure calculation of base and total token cost for a meal.
 * Breakfast = 1, Lunch = 2, Dinner = 2. Guest meals cost double (2x).
 */
export function calculateMealCost(
  mealType: MealType,
  isGuestMeal: boolean
): { baseCost: number; tokenCost: number } {
  const baseCost = MEAL_BASE_COSTS[mealType];
  if (typeof baseCost !== 'number') {
    throw new Error(`Invalid meal type: ${String(mealType)}`);
  }
  const tokenCost = isGuestMeal ? baseCost * GUEST_MULTIPLIER : baseCost;
  return { baseCost, tokenCost };
}

/**
 * Pure calculation of valid meal skip token refund:
 * Half the meal's base tokens, rounded down: Math.floor(baseCost / 2).
 * Breakfast (1) -> 0, Lunch (2) -> 1, Dinner (2) -> 1.
 */
export function calculateSkipRefund(mealType: MealType): {
  baseCost: number;
  refundTokens: number;
} {
  const baseCost = MEAL_BASE_COSTS[mealType];
  if (typeof baseCost !== 'number') {
    throw new Error(`Invalid meal type: ${String(mealType)}`);
  }
  const refundTokens = Math.floor(baseCost / 2);
  return { baseCost, refundTokens };
}

/**
 * Calculates Tomorrow's Mess Forecast:
 * Total Forecast = (Enrolled Students - Students Who Skipped) + Guests.
 * Triggers a warning if totalForecastMeals > 120.
 */
export function calculateTomorrowForecast(params: {
  forecastDate: string;
  enrolledStudents: number;
  studentsSkipped: number;
  guestMealsCount: number;
}): TomorrowForecastSummary {
  const enrolled = Math.max(0, Math.floor(params.enrolledStudents));
  const skipped = Math.min(enrolled, Math.max(0, Math.floor(params.studentsSkipped)));
  const studentsAttending = enrolled - skipped;
  const guests = Math.max(0, Math.floor(params.guestMealsCount));
  const totalForecastMeals = studentsAttending + guests;
  const exceedsCapacityThreshold = totalForecastMeals > FORECAST_WARNING_THRESHOLD;
  const mealsOverThreshold = Math.max(0, totalForecastMeals - FORECAST_WARNING_THRESHOLD);

  const warningMessage = exceedsCapacityThreshold
    ? `Capacity Warning: Tomorrow's forecast is ${totalForecastMeals} meals (${studentsAttending} students who haven't skipped + ${guests} guests), exceeding the ${FORECAST_WARNING_THRESHOLD}-meal limit by ${mealsOverThreshold} ${
        mealsOverThreshold === 1 ? 'meal' : 'meals'
      }.`
    : null;

  return {
    forecastDate: params.forecastDate,
    enrolledStudents: enrolled,
    studentsSkipped: skipped,
    studentsAttending,
    guestMealsCount: guests,
    totalForecastMeals,
    warningThreshold: FORECAST_WARNING_THRESHOLD,
    exceedsCapacityThreshold,
    mealsOverThreshold,
    warningMessage,
  };
}

/**
 * Builds the chronological token balance trend series over the course of the current month
 * for the Recharts LineChart beneath the Monthly Billing Statement section.
 */
export function buildMonthlyBalanceTrendSeries(
  account: StudentAccountData,
  logs: MealLogRecord[]
): BalanceTrendPoint[] {
  const allowance = account.monthlyAllowance || MONTHLY_STARTING_TOKENS;
  const monthPrefix = account.currentMonth || '2026-10';

  if (logs.length === 0) {
    // When no live transactions have been logged yet, show the opening trajectory across the month
    // starting at opening allowance and holding at current account.tokenBalance
    return [
      {
        stepLabel: `${monthPrefix}-01`,
        dateLabel: 'Day 01 (Start)',
        tokenBalance: allowance,
        openingAllowance: allowance,
        eventLabel: `Cycle Opening Credit (${allowance}T)`,
      },
      {
        stepLabel: `${monthPrefix}-10`,
        dateLabel: 'Day 10',
        tokenBalance: Math.round(allowance - (allowance - account.tokenBalance) * 0.35),
        openingAllowance: allowance,
        eventLabel: 'Mid-Cycle Checkpoint',
      },
      {
        stepLabel: `${monthPrefix}-20`,
        dateLabel: 'Day 20',
        tokenBalance: Math.round(allowance - (allowance - account.tokenBalance) * 0.7),
        openingAllowance: allowance,
        eventLabel: 'Day 20 Checkpoint',
      },
      {
        stepLabel: `${monthPrefix}-29`,
        dateLabel: 'Current',
        tokenBalance: account.tokenBalance,
        openingAllowance: allowance,
        eventLabel: `Current Balance (${account.tokenBalance}T)`,
      },
    ];
  }

  // Sort logs chronologically (oldest first)
  const chronological = [...logs].reverse();
  const points: BalanceTrendPoint[] = [
    {
      stepLabel: `${monthPrefix}-01`,
      dateLabel: 'Start (Day 1)',
      tokenBalance: allowance,
      openingAllowance: allowance,
      eventLabel: `Opening Monthly Allowance (${allowance}T)`,
    },
  ];

  chronological.forEach((log, idx) => {
    const isSkip = log.entryKind === 'skip';
    const deltaStr = isSkip ? `+${log.refundTokens}T Skip` : `-${log.tokenCost}T Meal`;
    const mealName = MEAL_METADATA[log.mealType]?.label || log.mealType;
    points.push({
      stepLabel: `Tx #${idx + 1}`,
      dateLabel: `${log.targetMealDate.slice(5)} · #${idx + 1}`,
      tokenBalance: log.balanceAfter,
      openingAllowance: allowance,
      eventLabel: `${mealName} (${deltaStr}) → ${log.balanceAfter}T`,
    });
  });

  return points;
}

/**
 * Parses a calendar date YYYY-MM-DD and returns the UTC epoch ms for
 * 8:00 PM (20:00) on the previous calendar day, plus a human-readable label.
 */
export function getSkipCutoffInfo(targetMealDate: string): {
  validFormat: boolean;
  cutoffEpochMs: number;
  cutoffIsoLocal: string;
  cutoffFormatted: string;
} {
  if (!DATE_YMD_REGEX.test(targetMealDate)) {
    return {
      validFormat: false,
      cutoffEpochMs: 0,
      cutoffIsoLocal: '',
      cutoffFormatted: 'Invalid Date',
    };
  }
  const [yStr, mStr, dStr] = targetMealDate.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  const cutoffDateUtc = new Date(Date.UTC(year, month - 1, day - 1, SKIP_CUTOFF_HOUR_24, 0, 0, 0));
  const prevY = cutoffDateUtc.getUTCFullYear();
  const prevM = String(cutoffDateUtc.getUTCMonth() + 1).padStart(2, '0');
  const prevD = String(cutoffDateUtc.getUTCDate()).padStart(2, '0');
  const cutoffIsoLocal = `${prevY}-${prevM}-${prevD}T20:00`;

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const cutoffFormatted = `${monthNames[cutoffDateUtc.getUTCMonth()]} ${prevD}, ${prevY} at 8:00 PM`;

  return {
    validFormat: true,
    cutoffEpochMs: cutoffDateUtc.getTime(),
    cutoffIsoLocal,
    cutoffFormatted,
  };
}

/**
 * Parses a simulated clock string (e.g. "2026-10-29T18:30" or ISO string)
 * into deterministic calendar coordinates matching getSkipCutoffInfo.
 */
export function parseSimulatedClock(clockStr: string): {
  valid: boolean;
  epochMs: number;
  formatted: string;
  dateYmd: string;
} {
  const trimmed = (clockStr || '').trim();
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[T\s]([0-9]{2}):([0-9]{2})/.exec(trimmed);
  if (!match) {
    return { valid: false, epochMs: 0, formatted: 'Invalid Clock', dateYmd: '' };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  const dtUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const formatted = `${monthNames[dtUtc.getUTCMonth()]} ${String(day).padStart(
    2,
    '0'
  )}, ${year} at ${hour12}:${String(minute).padStart(2, '0')} ${period}`;

  return {
    valid: true,
    epochMs: dtUtc.getTime(),
    formatted,
    dateYmd: `${match[1]}-${match[2]}-${match[3]}`,
  };
}

/**
 * Validates and applies a meal deduction against a StudentAccountData record.
 * Strictly blocks any deduction that would cause tokenBalance to drop below 0.
 */
export function validateAndApplyMealDeduction(
  account: StudentAccountData,
  input: MealLogInput
): MealDeductionResult {
  const { baseCost, tokenCost } = calculateMealCost(input.mealType, input.isGuestMeal);

  const sanitizedCounter = (input.diningCounter || '').trim().slice(0, 60);
  const sanitizedNotes = (input.notes || '').trim().slice(0, 200);

  if (!sanitizedCounter) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Please select or enter a valid hostel dining hall counter.',
      requiredTokens: tokenCost,
      availableTokens: account.tokenBalance,
    };
  }

  // Strict Zero-Balance Overdraft Guard
  if (account.tokenBalance < tokenCost || account.tokenBalance - tokenCost < 0) {
    const mealName = `${input.isGuestMeal ? 'Guest ' : ''}${MEAL_METADATA[input.mealType].label}`;
    return {
      ok: false,
      code: 'OVERDRAFT_BLOCKED',
      message: `Overdraft Blocked: ${mealName} requires ${tokenCost} ${
        tokenCost === 1 ? 'token' : 'tokens'
      }, but your available balance is ${account.tokenBalance} ${
        account.tokenBalance === 1 ? 'token' : 'tokens'
      }. Balance can never go below 0.`,
      requiredTokens: tokenCost,
      availableTokens: account.tokenBalance,
    };
  }

  const nowIso = input.timestampIso || new Date().toISOString();
  const targetMealDate =
    input.targetMealDate && DATE_YMD_REGEX.test(input.targetMealDate)
      ? input.targetMealDate
      : nowIso.slice(0, 10);

  const balanceBefore = account.tokenBalance;
  const balanceAfter = balanceBefore - tokenCost;
  const tokensUsed = account.tokensUsed + tokenCost;

  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(
    /[^a-zA-Z0-9_\-]/g,
    ''
  );

  const logEntry: MealLogRecord = {
    id: logId,
    studentUid: account.uid,
    studentId: account.studentId,
    entryKind: 'meal',
    mealType: input.mealType,
    isGuestMeal: input.isGuestMeal,
    baseCost,
    tokenCost,
    refundTokens: 0,
    targetMealDate,
    balanceBefore,
    balanceAfter,
    diningCounter: sanitizedCounter,
    notes: sanitizedNotes,
    billingMonth: account.currentMonth,
    loggedAtIso: nowIso,
  };

  const updatedAccount: StudentAccountData = {
    ...account,
    tokenBalance: balanceAfter,
    tokensUsed,
    mealsLoggedCount: account.mealsLoggedCount + 1,
    guestMealsCount: account.guestMealsCount + (input.isGuestMeal ? 1 : 0),
    updatedAt: nowIso,
  };

  return {
    ok: true,
    updatedAccount,
    logEntry,
    baseCost,
    tokenCost,
  };
}

/**
 * Validates and logs a meal skip.
 * Rule 1: Must be logged before 8:00 PM (20:00) on the day before targetMealDate.
 * Rule 2: Refunds half the meal's base tokens, rounded down (floor(baseCost / 2)).
 */
export function validateAndApplyMealSkip(
  account: StudentAccountData,
  input: MealSkipInput,
  existingLogs: MealLogRecord[] = []
): MealSkipResult {
  const { baseCost, refundTokens } = calculateSkipRefund(input.mealType);
  const cutoffInfo = getSkipCutoffInfo(input.targetMealDate);
  const clockInfo = parseSimulatedClock(input.simulatedClock);

  if (!cutoffInfo.validFormat) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Please select a valid target meal date (YYYY-MM-DD).',
      cutoffFormatted: cutoffInfo.cutoffFormatted,
      simulatedFormatted: clockInfo.formatted,
      refundTokens,
    };
  }

  if (!clockInfo.valid) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Please set a valid simulated clock date and time.',
      cutoffFormatted: cutoffInfo.cutoffFormatted,
      simulatedFormatted: clockInfo.formatted,
      refundTokens,
    };
  }

  const duplicate = existingLogs.some(
    (log) =>
      log.entryKind === 'skip' &&
      log.targetMealDate === input.targetMealDate &&
      log.mealType === input.mealType
  );
  if (duplicate) {
    return {
      ok: false,
      code: 'DUPLICATE_SKIP',
      message: `Duplicate Skip Blocked: ${MEAL_METADATA[input.mealType].label} on ${
        input.targetMealDate
      } has already been marked as skipped.`,
      cutoffFormatted: cutoffInfo.cutoffFormatted,
      simulatedFormatted: clockInfo.formatted,
      refundTokens,
    };
  }

  if (clockInfo.epochMs >= cutoffInfo.cutoffEpochMs) {
    return {
      ok: false,
      code: 'SKIP_DEADLINE_PASSED',
      message: `Skip Blocked — Past 8:00 PM Previous-Day Cutoff: Skipping ${
        MEAL_METADATA[input.mealType].label
      } for ${input.targetMealDate} required logging before ${
        cutoffInfo.cutoffFormatted
      }, but the simulated clock is set to ${clockInfo.formatted}.`,
      cutoffFormatted: cutoffInfo.cutoffFormatted,
      simulatedFormatted: clockInfo.formatted,
      refundTokens,
    };
  }

  const sanitizedNotes = (input.notes || '').trim().slice(0, 200);
  const balanceBefore = account.tokenBalance;
  const balanceAfter = balanceBefore + refundTokens;
  const tokensRefunded = account.tokensRefunded + refundTokens;

  const logId = `skip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(
    /[^a-zA-Z0-9_\-]/g,
    ''
  );

  const logEntry: MealLogRecord = {
    id: logId,
    studentUid: account.uid,
    studentId: account.studentId,
    entryKind: 'skip',
    mealType: input.mealType,
    isGuestMeal: false,
    baseCost,
    tokenCost: 0,
    refundTokens,
    targetMealDate: input.targetMealDate,
    balanceBefore,
    balanceAfter,
    diningCounter: `Pre-8PM Skip Verified (${input.targetMealDate})`,
    notes:
      sanitizedNotes ||
      `Skipped ${MEAL_METADATA[input.mealType].label} for ${
        input.targetMealDate
      } (floor(${baseCost}/2) = +${refundTokens}T)`,
    billingMonth: account.currentMonth,
    loggedAtIso: input.simulatedClock.slice(0, 16) + ':00.000Z',
  };

  const updatedAccount: StudentAccountData = {
    ...account,
    tokenBalance: balanceAfter,
    tokensRefunded,
    skipsLoggedCount: account.skipsLoggedCount + 1,
    updatedAt: logEntry.loggedAtIso,
  };

  return {
    ok: true,
    updatedAccount,
    logEntry,
    baseCost,
    refundTokens,
    cutoffFormatted: cutoffInfo.cutoffFormatted,
    simulatedFormatted: clockInfo.formatted,
  };
}

/**
 * Pure calculation for unused monthly token rollover, capped at 10 tokens.
 */
export function calculateMonthlyRollover(unusedTokenBalance: number): {
  rolloverTokens: number;
  forfeitedTokens: number;
  nextMonthOpeningAllowance: number;
} {
  const safeUnused = Math.max(0, Math.floor(unusedTokenBalance));
  const rolloverTokens = Math.min(safeUnused, MAX_ROLLOVER_TOKENS);
  const forfeitedTokens = Math.max(0, safeUnused - MAX_ROLLOVER_TOKENS);
  const nextMonthOpeningAllowance = MONTHLY_STARTING_TOKENS + rolloverTokens;
  return {
    rolloverTokens,
    forfeitedTokens,
    nextMonthOpeningAllowance,
  };
}

/**
 * Advances a student account to the next billing month (YYYY-MM),
 * rolling over unused tokens capped at 10 on top of the 60 base monthly tokens.
 */
export function applyMonthlyRollover(
  account: StudentAccountData,
  explicitNextMonth?: string
): {
  updatedAccount: StudentAccountData;
  previousMonth: string;
  nextMonth: string;
  previousUnusedBalance: number;
  rolloverTokens: number;
  forfeitedTokens: number;
  nextMonthOpeningAllowance: number;
} {
  const previousMonth = account.currentMonth;
  let nextMonth = explicitNextMonth || '';
  if (!nextMonth || !BILLING_MONTH_REGEX.test(nextMonth)) {
    const [yStr, mStr] = previousMonth.split('-');
    let year = Number(yStr) || 2026;
    let month = Number(mStr) || 10;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    nextMonth = `${year}-${String(month).padStart(2, '0')}`;
  }

  const previousUnusedBalance = account.tokenBalance;
  const { rolloverTokens, forfeitedTokens, nextMonthOpeningAllowance } =
    calculateMonthlyRollover(previousUnusedBalance);

  const nowIso = new Date().toISOString();
  const updatedAccount: StudentAccountData = {
    ...account,
    currentMonth: nextMonth,
    rolloverTokens,
    monthlyAllowance: nextMonthOpeningAllowance,
    tokenBalance: nextMonthOpeningAllowance,
    tokensUsed: 0,
    tokensRefunded: 0,
    mealsLoggedCount: 0,
    guestMealsCount: 0,
    skipsLoggedCount: 0,
    updatedAt: nowIso,
  };

  return {
    updatedAccount,
    previousMonth,
    nextMonth,
    previousUnusedBalance,
    rolloverTokens,
    forfeitedTokens,
    nextMonthOpeningAllowance,
  };
}

export interface MonthlyBillingSummary {
  openingAllowance: number;
  baseMonthlyTokens: number;
  rolloverTokens: number;
  tokensUsed: number;
  tokensRefunded: number;
  tokensRemaining: number;
  projectedRolloverNextMonth: number;
  projectedForfeitedNextMonth: number;
  utilizationPercent: number;
  breakfastCount: number;
  breakfastTokens: number;
  lunchCount: number;
  lunchTokens: number;
  dinnerCount: number;
  dinnerTokens: number;
  guestMealsCount: number;
  guestMealsTokens: number;
  regularMealsTokens: number;
  skipsCount: number;
  estimatedFullDaysRemaining: number;
}

/**
 * Computes a complete monthly dietary credit & billing breakdown from the account and logs.
 */
export function computeMonthlyBillingSummary(
  account: StudentAccountData,
  logs: MealLogRecord[]
): MonthlyBillingSummary {
  let breakfastCount = 0;
  let breakfastTokens = 0;
  let lunchCount = 0;
  let lunchTokens = 0;
  let dinnerCount = 0;
  let dinnerTokens = 0;
  let guestMealsCount = 0;
  let guestMealsTokens = 0;
  let regularMealsTokens = 0;
  let skipsCount = 0;

  for (const log of logs) {
    if (log.entryKind === 'skip') {
      skipsCount += 1;
      continue;
    }

    if (log.mealType === 'breakfast') {
      breakfastCount += 1;
      breakfastTokens += log.tokenCost;
    } else if (log.mealType === 'lunch') {
      lunchCount += 1;
      lunchTokens += log.tokenCost;
    } else if (log.mealType === 'dinner') {
      dinnerCount += 1;
      dinnerTokens += log.tokenCost;
    }

    if (log.isGuestMeal) {
      guestMealsCount += 1;
      guestMealsTokens += log.tokenCost;
    } else {
      regularMealsTokens += log.tokenCost;
    }
  }

  const openingAllowance = account.monthlyAllowance || MONTHLY_STARTING_TOKENS;
  const rolloverTokens = account.rolloverTokens || 0;
  const tokensRemaining = account.tokenBalance;
  const tokensUsed = account.tokensUsed;
  const tokensRefunded = account.tokensRefunded || 0;
  const utilizationPercent = Math.round((tokensUsed / openingAllowance) * 100);
  const estimatedFullDaysRemaining = Math.floor(tokensRemaining / 5);
  const { rolloverTokens: projectedRolloverNextMonth, forfeitedTokens: projectedForfeitedNextMonth } =
    calculateMonthlyRollover(tokensRemaining);

  return {
    openingAllowance,
    baseMonthlyTokens: MONTHLY_STARTING_TOKENS,
    rolloverTokens,
    tokensUsed,
    tokensRefunded,
    tokensRemaining,
    projectedRolloverNextMonth,
    projectedForfeitedNextMonth,
    utilizationPercent,
    breakfastCount,
    breakfastTokens,
    lunchCount,
    lunchTokens,
    dinnerCount,
    dinnerTokens,
    guestMealsCount,
    guestMealsTokens,
    regularMealsTokens,
    skipsCount,
    estimatedFullDaysRemaining,
  };
}

/**
 * Creates a fresh 60-token student account for the start of a billing month.
 */
export function createInitialStudentAccount(params?: {
  uid?: string;
  studentId?: string;
  fullName?: string;
  hostelBlock?: string;
  roomNumber?: string;
  currentMonth?: string;
  rolloverTokens?: number;
}): StudentAccountData {
  const nowIso = '2026-10-29T18:00:00.000Z';
  const rollover = Math.min(Math.max(0, params?.rolloverTokens || 0), MAX_ROLLOVER_TOKENS);
  const allowance = MONTHLY_STARTING_TOKENS + rollover;
  return {
    uid: params?.uid || 'student_demo_01',
    studentId: params?.studentId || 'HST-2026-0418',
    fullName: params?.fullName || 'Aarav Deshmukh',
    hostelBlock: params?.hostelBlock || 'Block C · Ramanujan Wing',
    roomNumber: params?.roomNumber || 'C-304',
    currentMonth: params?.currentMonth || '2026-10',
    monthlyAllowance: allowance,
    rolloverTokens: rollover,
    tokenBalance: allowance,
    tokensUsed: 0,
    tokensRefunded: 0,
    mealsLoggedCount: 0,
    guestMealsCount: 0,
    skipsLoggedCount: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
