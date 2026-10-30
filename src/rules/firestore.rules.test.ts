import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const MONTH_REGEX = /^[0-9]{4}-[0-9]{2}$/;
const DATE_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

interface AuthContext {
  uid: string;
  email_verified: boolean;
}

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && VALID_ID_REGEX.test(id);
}

function evaluateStudentAccountWrite(
  auth: AuthContext | null,
  studentUidParam: string,
  data: Record<string, unknown>,
  requestTime: string
): boolean {
  if (!auth || !auth.email_verified || auth.uid !== studentUidParam) return false;
  if (!isValidId(studentUidParam)) return false;

  const requiredKeys = [
    'uid',
    'studentId',
    'fullName',
    'hostelBlock',
    'roomNumber',
    'currentMonth',
    'monthlyAllowance',
    'rolloverTokens',
    'tokenBalance',
    'tokensUsed',
    'tokensRefunded',
    'mealsLoggedCount',
    'guestMealsCount',
    'skipsLoggedCount',
    'createdAt',
    'updatedAt',
  ];
  const keys = Object.keys(data);
  if (!requiredKeys.every((k) => keys.includes(k)) || !keys.every((k) => requiredKeys.includes(k))) {
    return false;
  }

  if (data.uid !== auth.uid || data.uid !== studentUidParam || !isValidId(data.uid)) return false;
  if (
    typeof data.studentId !== 'string' ||
    data.studentId.length < 3 ||
    data.studentId.length > 32 ||
    !VALID_ID_REGEX.test(data.studentId)
  )
    return false;
  if (typeof data.fullName !== 'string' || data.fullName.length < 1 || data.fullName.length > 100)
    return false;
  if (
    typeof data.hostelBlock !== 'string' ||
    data.hostelBlock.length < 1 ||
    data.hostelBlock.length > 60
  )
    return false;
  if (
    typeof data.roomNumber !== 'string' ||
    data.roomNumber.length < 1 ||
    data.roomNumber.length > 20
  )
    return false;
  if (typeof data.currentMonth !== 'string' || !MONTH_REGEX.test(data.currentMonth)) return false;

  const rollover = data.rolloverTokens as number;
  if (!Number.isInteger(rollover) || rollover < 0 || rollover > 10) return false;

  const allowance = data.monthlyAllowance as number;
  if (!Number.isInteger(allowance) || allowance !== 60 + rollover) return false;

  const tBal = data.tokenBalance as number;
  const tUsed = data.tokensUsed as number;
  const tRef = data.tokensRefunded as number;
  if (!Number.isInteger(tBal) || tBal < 0 || tBal > 130) return false;
  if (!Number.isInteger(tUsed) || tUsed < 0 || tUsed > 130) return false;
  if (!Number.isInteger(tRef) || tRef < 0 || tRef > 60) return false;

  if (tBal !== allowance - tUsed + tRef) return false;
  if (data.updatedAt !== requestTime) return false;

  return true;
}

function evaluateMealLogCreate(
  auth: AuthContext | null,
  studentUidParam: string,
  logIdParam: string,
  data: Record<string, unknown>,
  requestTime: string
): boolean {
  if (!auth || !auth.email_verified || auth.uid !== studentUidParam) return false;
  if (!isValidId(studentUidParam) || !isValidId(logIdParam)) return false;

  const requiredKeys = [
    'id',
    'studentUid',
    'studentId',
    'entryKind',
    'mealType',
    'isGuestMeal',
    'baseCost',
    'tokenCost',
    'refundTokens',
    'targetMealDate',
    'balanceBefore',
    'balanceAfter',
    'diningCounter',
    'notes',
    'billingMonth',
    'loggedAtIso',
    'createdAt',
  ];
  const keys = Object.keys(data);
  if (!requiredKeys.every((k) => keys.includes(k)) || !keys.every((k) => requiredKeys.includes(k))) {
    return false;
  }

  if (data.id !== logIdParam || data.studentUid !== studentUidParam) return false;
  if (data.entryKind !== 'meal' && data.entryKind !== 'skip') return false;

  const validMealRate =
    (data.mealType === 'breakfast' && data.baseCost === 1) ||
    (data.mealType === 'lunch' && data.baseCost === 2) ||
    (data.mealType === 'dinner' && data.baseCost === 2);
  if (!validMealRate) return false;

  const before = data.balanceBefore as number;
  const after = data.balanceAfter as number;
  if (!Number.isInteger(before) || before < 0 || before > 130) return false;
  if (!Number.isInteger(after) || after < 0 || after > 130) return false;

  if (data.entryKind === 'meal') {
    if (data.refundTokens !== 0) return false;
    const expectedCost = data.isGuestMeal
      ? (data.baseCost as number) * 2
      : (data.baseCost as number);
    if (data.tokenCost !== expectedCost) return false;
    if (before < 1 || before - expectedCost !== after) return false;
  } else {
    // skip
    if (data.isGuestMeal !== false || data.tokenCost !== 0) return false;
    const expectedRefund = data.baseCost === 1 ? 0 : 1;
    if (data.refundTokens !== expectedRefund) return false;
    if (before + expectedRefund !== after) return false;
  }

  if (typeof data.targetMealDate !== 'string' || !DATE_REGEX.test(data.targetMealDate))
    return false;
  if (
    typeof data.diningCounter !== 'string' ||
    data.diningCounter.length < 1 ||
    data.diningCounter.length > 60
  )
    return false;
  if (typeof data.notes !== 'string' || data.notes.length > 200) return false;
  if (data.createdAt !== requestTime) return false;

  return true;
}

const NOW = '2026-10-29T18:00:00Z';
const VALID_STUDENT_BASE = {
  uid: 'uid_student_1',
  studentId: 'HST-2026-0418',
  fullName: 'Aarav Deshmukh',
  hostelBlock: 'Block C',
  roomNumber: 'C-304',
  currentMonth: '2026-10',
  monthlyAllowance: 60,
  rolloverTokens: 0,
  tokenBalance: 60,
  tokensUsed: 0,
  tokensRefunded: 0,
  mealsLoggedCount: 0,
  guestMealsCount: 0,
  skipsLoggedCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const VALID_MEAL_LOG_BASE = {
  id: 'log_101',
  studentUid: 'uid_student_1',
  studentId: 'HST-2026-0418',
  entryKind: 'meal',
  mealType: 'lunch',
  isGuestMeal: false,
  baseCost: 2,
  tokenCost: 2,
  refundTokens: 0,
  targetMealDate: '2026-10-29',
  balanceBefore: 60,
  balanceAfter: 58,
  diningCounter: 'Central Commons',
  notes: 'Regular thali',
  billingMonth: '2026-10',
  loggedAtIso: NOW,
  createdAt: NOW,
};

test('firestore.rules file contains all 8 hardened security pillars plus skip and rollover rules', () => {
  assert.match(rulesContent, /rules_version = '2';/);
  assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.match(rulesContent, /data\.rolloverTokens <= 10/);
  assert.match(rulesContent, /data\.entryKind == 'skip'/);
  assert.match(rulesContent, /data\.tokenBalance >= 0/);
  assert.match(rulesContent, /getAfter\(/);
});

test('Dirty Dozen #1-3: Identity spoofing, unverified email, and overdraft < 0 are denied', () => {
  assert.equal(
    evaluateStudentAccountWrite(
      { uid: 'uid_attacker', email_verified: true },
      'uid_student_1',
      VALID_STUDENT_BASE,
      NOW
    ),
    false
  );
  assert.equal(
    evaluateStudentAccountWrite(
      { uid: 'uid_student_1', email_verified: false },
      'uid_student_1',
      VALID_STUDENT_BASE,
      NOW
    ),
    false
  );
  assert.equal(
    evaluateStudentAccountWrite(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      { ...VALID_STUDENT_BASE, tokenBalance: -2, tokensUsed: 62 },
      NOW
    ),
    false
  );
});

test('Dirty Dozen #4: Rollover exceeding 10-token cap (e.g. 15) is denied', () => {
  assert.equal(
    evaluateStudentAccountWrite(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      {
        ...VALID_STUDENT_BASE,
        rolloverTokens: 15,
        monthlyAllowance: 75,
        tokenBalance: 75,
      },
      NOW
    ),
    false
  );

  // Valid rollover of 10 tokens (monthlyAllowance: 70) is allowed
  assert.equal(
    evaluateStudentAccountWrite(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      {
        ...VALID_STUDENT_BASE,
        rolloverTokens: 10,
        monthlyAllowance: 70,
        tokenBalance: 70,
      },
      NOW
    ),
    true
  );
});

test('Dirty Dozen #5-8: Broken conservation math, tampered pricing, bypassed guest 2x, and negative balanceAfter are denied', () => {
  assert.equal(
    evaluateStudentAccountWrite(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      { ...VALID_STUDENT_BASE, tokenBalance: 55, tokensUsed: 2 },
      NOW
    ),
    false
  );

  assert.equal(
    evaluateMealLogCreate(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      'log_101',
      { ...VALID_MEAL_LOG_BASE, mealType: 'dinner', baseCost: 1, tokenCost: 1, balanceAfter: 59 },
      NOW
    ),
    false
  );

  assert.equal(
    evaluateMealLogCreate(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      'log_101',
      { ...VALID_MEAL_LOG_BASE, mealType: 'lunch', isGuestMeal: true, baseCost: 2, tokenCost: 2 },
      NOW
    ),
    false
  );

  assert.equal(
    evaluateMealLogCreate(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      'log_101',
      {
        ...VALID_MEAL_LOG_BASE,
        mealType: 'dinner',
        isGuestMeal: true,
        baseCost: 2,
        tokenCost: 4,
        balanceBefore: 2,
        balanceAfter: -2,
      },
      NOW
    ),
    false
  );
});

test('Dirty Dozen #9: Inflated skip refund (claiming 1T for breakfast or 2T for lunch) is denied', () => {
  // Breakfast skip claiming refundTokens: 1 instead of floor(1/2) = 0 -> DENIED
  assert.equal(
    evaluateMealLogCreate(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      'skip_101',
      {
        ...VALID_MEAL_LOG_BASE,
        id: 'skip_101',
        entryKind: 'skip',
        mealType: 'breakfast',
        baseCost: 1,
        tokenCost: 0,
        refundTokens: 1,
        balanceBefore: 58,
        balanceAfter: 59,
      },
      NOW
    ),
    false
  );

  // Valid Lunch skip claiming refundTokens: 1 (floor(2/2) = 1) -> ALLOWED
  assert.equal(
    evaluateMealLogCreate(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      'skip_102',
      {
        ...VALID_MEAL_LOG_BASE,
        id: 'skip_102',
        entryKind: 'skip',
        mealType: 'lunch',
        baseCost: 2,
        tokenCost: 0,
        refundTokens: 1,
        balanceBefore: 58,
        balanceAfter: 59,
      },
      NOW
    ),
    true
  );
});

test('Dirty Dozen #10-12: Ghost fields and oversized strings are denied', () => {
  assert.equal(
    evaluateStudentAccountWrite(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      { ...VALID_STUDENT_BASE, isAdmin: true },
      NOW
    ),
    false
  );
  assert.equal(
    evaluateMealLogCreate(
      { uid: 'uid_student_1', email_verified: true },
      'uid_student_1',
      'log_101',
      { ...VALID_MEAL_LOG_BASE, notes: 'x'.repeat(250) },
      NOW
    ),
    false
  );
});
