/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Coffee,
  FastForward,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  RotateCcw,
  Search,
  ShieldAlert,
  Sun,
  Users,
  Utensils,
} from 'lucide-react';
import {
  auth,
  commitFirestoreMealTransaction,
  db,
  handleFirestoreError,
  initializeFirestoreStudentAccount,
  OperationType,
  resetFirestoreStudentCycle,
  signInStudentWithGoogle,
  signOutStudent,
} from './firebase';
import {
  applyMonthlyRollover,
  calculateMealCost,
  calculateMonthlyRollover,
  calculateSkipRefund,
  computeMonthlyBillingSummary,
  createInitialStudentAccount,
  getSkipCutoffInfo,
  LedgerEntryKind,
  MAX_ROLLOVER_TOKENS,
  MEAL_METADATA,
  MealLogRecord,
  MealType,
  MONTHLY_STARTING_TOKENS,
  parseSimulatedClock,
  SIMULATED_CLOCK_PRESET_OPTIONS,
  StudentAccountData,
  validateAndApplyMealDeduction,
  validateAndApplyMealSkip,
} from './utils/tokenRules';
import { PunchGridVisualizer } from './components/PunchGridVisualizer';
import { SchemaArchitecturePanel } from './components/SchemaArchitectureModal';
import { MonthlyBalanceTrendChart } from './components/MonthlyBalanceTrendChart';
import { AdminForecastPage } from './components/AdminForecastPage';

type LedgerFilter = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'guest' | 'skip';
type TerminalMode = 'eat' | 'skip';
type WorkspacePage = 'student' | 'admin';

const DINING_COUNTERS = [
  'North Hall · Morning Line A',
  'Central Commons · Thali Counter 2',
  'Central Commons · Evening Grill B',
  'South Courtyard · Dietetics Counter',
];

const SIMULATED_DATE_OPTIONS = [
  { value: '2026-10-28', label: 'Oct 28, 2026 (2 Days Before Oct 30)' },
  { value: '2026-10-29', label: 'Oct 29, 2026 (Previous Day for Oct 30)' },
  { value: '2026-10-30', label: 'Oct 30, 2026 (Target Meal Day)' },
  { value: '2026-10-31', label: 'Oct 31, 2026 (Month End)' },
];

const SIMULATED_TIME_OPTIONS = [
  { value: '08:00', label: '08:00 AM (Morning)' },
  { value: '12:30', label: '12:30 PM (Noon)' },
  { value: '14:00', label: '02:00 PM (Afternoon — Before 8 PM)' },
  { value: '17:00', label: '05:00 PM (Evening — Before 8 PM)' },
  { value: '18:30', label: '06:30 PM (Valid — Before 8 PM Cutoff)' },
  { value: '19:45', label: '07:45 PM (15m Before 8 PM Cutoff)' },
  { value: '20:15', label: '08:15 PM (Late — Past 8 PM Cutoff)' },
  { value: '21:15', label: '09:15 PM (Late Night — Past 8 PM Cutoff)' },
  { value: '22:30', label: '10:30 PM (Night — Past 8 PM Cutoff)' },
];

export default function App() {
  // Active Page: 'student' (Student Portal) or 'admin' (Admin Forecast Page)
  const [activePage, setActivePage] = useState<WorkspacePage>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'admin' ? 'admin' : 'student';
  });

  // Firebase Auth state
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Student Account & Meal Logs state (starts at 60 tokens as required by Stage 1 spec)
  const [account, setAccount] = useState<StudentAccountData>(() =>
    createInitialStudentAccount()
  );
  const [mealLogs, setMealLogs] = useState<MealLogRecord[]>([]);

  // Terminal Mode: 'eat' (Log Meal) or 'skip' (Log Meal Skip before 8 PM prev day)
  const [terminalMode, setTerminalMode] = useState<TerminalMode>('eat');

  // Simulated Clock & Target Meal Date for Skip Validation
  const [simulatedClock, setSimulatedClock] = useState<string>('2026-10-29T18:30');
  const [targetMealDate, setTargetMealDate] = useState<string>('2026-10-30');

  // Derived date and time parts for the dropdown selectors
  const simulatedDatePart = simulatedClock.slice(0, 10) || '2026-10-29';
  const simulatedTimePart = simulatedClock.slice(11, 16) || '18:30';

  // Meal Logger Terminal controls
  const [selectedMeal, setSelectedMeal] = useState<MealType>('breakfast');
  const [isGuestMeal, setIsGuestMeal] = useState<boolean>(false);
  const [diningCounter, setDiningCounter] = useState<string>(
    MEAL_METADATA.breakfast.defaultCounter
  );
  const [mealNotes, setMealNotes] = useState<string>('');

  // Status, Overdraft & Skip Deadline Feedback
  const [overdraftError, setOverdraftError] = useState<{
    message: string;
    requiredTokens: number;
    availableTokens: number;
  } | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [lastSuccessBanner, setLastSuccessBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ledger History Filter & Search
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Student Profile Editor state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState(account.fullName);
  const [profileRoomInput, setProfileRoomInput] = useState(account.roomNumber);
  const [profileBlockInput, setProfileBlockInput] = useState(account.hostelBlock);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Attach Firestore real-time listeners when authenticated with Firebase
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const studentPath = `students/${firebaseUser.uid}`;
    const studentRef = doc(db, 'students', firebaseUser.uid);

    const unsubStudent = onSnapshot(
      studentRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          const freshAccount = createInitialStudentAccount({
            uid: firebaseUser.uid,
            studentId: `HST-2026-${firebaseUser.uid.slice(0, 4).toUpperCase()}`,
            fullName: firebaseUser.displayName || 'Resident Student',
            hostelBlock: 'Block C · Ramanujan Wing',
            roomNumber: 'C-304',
            currentMonth: '2026-10',
          });
          setAccount(freshAccount);
          await initializeFirestoreStudentAccount(freshAccount);
        } else {
          const data = snapshot.data();
          setAccount({
            uid: data.uid,
            studentId: data.studentId,
            fullName: data.fullName,
            hostelBlock: data.hostelBlock,
            roomNumber: data.roomNumber,
            currentMonth: data.currentMonth,
            monthlyAllowance: data.monthlyAllowance ?? MONTHLY_STARTING_TOKENS,
            rolloverTokens: data.rolloverTokens ?? 0,
            tokenBalance: data.tokenBalance ?? MONTHLY_STARTING_TOKENS,
            tokensUsed: data.tokensUsed ?? 0,
            tokensRefunded: data.tokensRefunded ?? 0,
            mealsLoggedCount: data.mealsLoggedCount ?? 0,
            guestMealsCount: data.guestMealsCount ?? 0,
            skipsLoggedCount: data.skipsLoggedCount ?? 0,
            createdAt:
              data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            updatedAt:
              data.updatedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, studentPath);
      }
    );

    const logsPath = `students/${firebaseUser.uid}/mealLogs`;
    const logsQuery = query(
      collection(db, 'students', firebaseUser.uid, 'mealLogs'),
      orderBy('loggedAtIso', 'desc')
    );

    const unsubLogs = onSnapshot(
      logsQuery,
      (snapshot) => {
        const loadedLogs: MealLogRecord[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: d.id,
            studentUid: d.studentUid,
            studentId: d.studentId,
            entryKind: (d.entryKind as LedgerEntryKind) || 'meal',
            mealType: d.mealType as MealType,
            isGuestMeal: Boolean(d.isGuestMeal),
            baseCost: Number(d.baseCost),
            tokenCost: Number(d.tokenCost),
            refundTokens: Number(d.refundTokens || 0),
            targetMealDate: String(
              d.targetMealDate || d.loggedAtIso?.slice(0, 10) || '2026-10-29'
            ),
            balanceBefore: Number(d.balanceBefore),
            balanceAfter: Number(d.balanceAfter),
            diningCounter: String(d.diningCounter),
            notes: String(d.notes || ''),
            billingMonth: String(d.billingMonth),
            loggedAtIso: String(d.loggedAtIso),
          };
        });
        setMealLogs(loadedLogs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, logsPath);
      }
    );

    return () => {
      unsubStudent();
      unsubLogs();
    };
  }, [authReady, firebaseUser]);

  // Keep default dining counter synced when switching meal type
  const handleSelectMealType = (mealType: MealType) => {
    setSelectedMeal(mealType);
    setDiningCounter(MEAL_METADATA[mealType].defaultCounter);
    setOverdraftError(null);
    setSkipError(null);
  };

  const handleToggleGuestMeal = (nextGuestState: boolean) => {
    setIsGuestMeal(nextGuestState);
    setOverdraftError(null);
    setSkipError(null);
  };

  // Live cost preview for currently selected meal
  const currentCostPreview = useMemo(
    () => calculateMealCost(selectedMeal, isGuestMeal),
    [selectedMeal, isGuestMeal]
  );

  // Live skip refund preview for currently selected meal: floor(baseCost / 2)
  const currentSkipPreview = useMemo(
    () => calculateSkipRefund(selectedMeal),
    [selectedMeal]
  );

  // Live 8:00 PM Previous-Day Cutoff calculation
  const skipCutoffStatus = useMemo(() => {
    const cutoff = getSkipCutoffInfo(targetMealDate);
    const clock = parseSimulatedClock(simulatedClock);
    const isBeforeDeadline =
      cutoff.validFormat && clock.valid && clock.epochMs < cutoff.cutoffEpochMs;
    return {
      cutoff,
      clock,
      isBeforeDeadline,
    };
  }, [targetMealDate, simulatedClock]);

  const wouldOverdraft =
    terminalMode === 'eat' && account.tokenBalance < currentCostPreview.tokenCost;

  // Monthly billing summary metrics
  const billingSummary = useMemo(
    () => computeMonthlyBillingSummary(account, mealLogs),
    [account, mealLogs]
  );

  // Next month rollover preview
  const rolloverPreview = useMemo(
    () => calculateMonthlyRollover(account.tokenBalance),
    [account.tokenBalance]
  );

  // Filtered meal logs
  const filteredLogs = useMemo(() => {
    return mealLogs.filter((log) => {
      if (ledgerFilter === 'breakfast' && log.mealType !== 'breakfast') return false;
      if (ledgerFilter === 'lunch' && log.mealType !== 'lunch') return false;
      if (ledgerFilter === 'dinner' && log.mealType !== 'dinner') return false;
      if (ledgerFilter === 'guest' && !log.isGuestMeal) return false;
      if (ledgerFilter === 'skip' && log.entryKind !== 'skip') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchMeal = log.mealType.toLowerCase().includes(q);
        const matchCounter = log.diningCounter.toLowerCase().includes(q);
        const matchNotes = log.notes.toLowerCase().includes(q);
        const matchKind = log.entryKind.toLowerCase().includes(q);
        return matchMeal || matchCounter || matchNotes || matchKind;
      }
      return true;
    });
  }, [mealLogs, ledgerFilter, searchQuery]);

  // Handle logging a meal or logging a meal skip
  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverdraftError(null);
    setSkipError(null);
    setLastSuccessBanner(null);

    if (terminalMode === 'skip') {
      const skipResult = validateAndApplyMealSkip(
        account,
        {
          mealType: selectedMeal,
          targetMealDate,
          simulatedClock,
          notes: mealNotes,
        },
        mealLogs
      );

      if (!skipResult.ok) {
        setSkipError(skipResult.message);
        return;
      }

      setIsSubmitting(true);
      try {
        if (firebaseUser) {
          await commitFirestoreMealTransaction(
            skipResult.updatedAccount,
            skipResult.logEntry
          );
        } else {
          setAccount(skipResult.updatedAccount);
          setMealLogs((prev) => [skipResult.logEntry, ...prev]);
        }

        const mealLabel = MEAL_METADATA[selectedMeal].label;
        setLastSuccessBanner(
          `Skip Verified for ${mealLabel} (${targetMealDate}): Logged at ${skipResult.simulatedFormatted} before cutoff (${skipResult.cutoffFormatted}). Refunded +${skipResult.refundTokens} ${
            skipResult.refundTokens === 1 ? 'token' : 'tokens'
          } (⌊${skipResult.baseCost} ÷ 2⌋). Balance: ${
            skipResult.updatedAccount.tokenBalance
          } tokens.`
        );
        setMealNotes('');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Eat Meal Mode
    const deduction = validateAndApplyMealDeduction(account, {
      mealType: selectedMeal,
      isGuestMeal,
      diningCounter,
      targetMealDate,
      notes: mealNotes,
      timestampIso: simulatedClock.slice(0, 16) + ':00.000Z',
    });

    if (!deduction.ok) {
      setOverdraftError({
        message: deduction.message,
        requiredTokens: deduction.requiredTokens,
        availableTokens: deduction.availableTokens,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (firebaseUser) {
        await commitFirestoreMealTransaction(
          deduction.updatedAccount,
          deduction.logEntry
        );
      } else {
        setAccount(deduction.updatedAccount);
        setMealLogs((prev) => [deduction.logEntry, ...prev]);
      }

      const mealLabel = `${isGuestMeal ? 'Guest ' : ''}${
        MEAL_METADATA[selectedMeal].label
      }`;
      setLastSuccessBanner(
        `Logged ${mealLabel} (-${deduction.tokenCost} ${
          deduction.tokenCost === 1 ? 'token' : 'tokens'
        }). Remaining balance: ${deduction.updatedAccount.tokenBalance} tokens.`
      );
      setMealNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Advance to Next Month & Roll Over Unused Tokens (Capped at 10)
  const handleRolloverToNextMonth = async () => {
    setOverdraftError(null);
    setSkipError(null);
    const rolloverOutcome = applyMonthlyRollover(account);

    if (firebaseUser) {
      await resetFirestoreStudentCycle(rolloverOutcome.updatedAccount);
    } else {
      setAccount(rolloverOutcome.updatedAccount);
      setMealLogs([]);
    }

    setLastSuccessBanner(
      `Cycle Rollover Complete (${rolloverOutcome.previousMonth} → ${rolloverOutcome.nextMonth}): Rolled over ${rolloverOutcome.rolloverTokens} unused tokens (capped at ${MAX_ROLLOVER_TOKENS}T; ${rolloverOutcome.forfeitedTokens}T expired above cap). New opening balance: ${rolloverOutcome.nextMonthOpeningAllowance} tokens (60 base + ${rolloverOutcome.rolloverTokens} rollover).`
    );
  };

  // Reset to a fresh 60-token month
  const handleResetMonthlyTokens = async () => {
    setOverdraftError(null);
    setSkipError(null);
    const resetAcc: StudentAccountData = {
      ...account,
      currentMonth: '2026-10',
      monthlyAllowance: MONTHLY_STARTING_TOKENS,
      rolloverTokens: 0,
      tokenBalance: MONTHLY_STARTING_TOKENS,
      tokensUsed: 0,
      tokensRefunded: 0,
      mealsLoggedCount: 0,
      guestMealsCount: 0,
      skipsLoggedCount: 0,
      updatedAt: new Date().toISOString(),
    };

    if (firebaseUser) {
      await resetFirestoreStudentCycle(resetAcc);
    } else {
      setAccount(resetAcc);
      setMealLogs([]);
    }
    setLastSuccessBanner(
      'Monthly cycle reset: Opening allocation restored to 60 tokens (0 rollover).'
    );
  };

  // Set balance to 1 token to immediately test the Overdraft Guard in 1 click
  const handleSimulateLowBalance = async () => {
    setOverdraftError(null);
    setSkipError(null);
    const usedCount = Math.max(0, account.monthlyAllowance + account.tokensRefunded - 1);
    const lowBalanceAcc: StudentAccountData = {
      ...account,
      tokenBalance: 1,
      tokensUsed: usedCount,
      mealsLoggedCount: Math.max(account.mealsLoggedCount, 30),
      updatedAt: new Date().toISOString(),
    };
    if (firebaseUser) {
      await resetFirestoreStudentCycle(lowBalanceAcc);
    } else {
      setAccount(lowBalanceAcc);
    }
    setLastSuccessBanner(
      'Balance calibrated to 1 token remaining. Try logging Lunch (2T) or Guest Meal to test the Overdraft Block, or roll over to next month (+1T rollover).'
    );
  };

  // Set balance to 7 tokens to test sub-cap rollover (7T -> 67T next month)
  const handleSimulateSevenTokensBalance = async () => {
    setOverdraftError(null);
    setSkipError(null);
    const usedCount = Math.max(0, account.monthlyAllowance + account.tokensRefunded - 7);
    const sevenAcc: StudentAccountData = {
      ...account,
      tokenBalance: 7,
      tokensUsed: usedCount,
      mealsLoggedCount: Math.max(account.mealsLoggedCount, 26),
      updatedAt: new Date().toISOString(),
    };
    if (firebaseUser) {
      await resetFirestoreStudentCycle(sevenAcc);
    } else {
      setAccount(sevenAcc);
    }
    setLastSuccessBanner(
      'Balance calibrated to 7 unused tokens remaining. Rolling over to next month will carry all 7 tokens (60 + 7 = 67T).'
    );
  };

  // Handle Google Sign-In / Sign-Out
  const handleAuthAction = async () => {
    setAuthError(null);
    if (firebaseUser) {
      await signOutStudent();
      setAccount(createInitialStudentAccount());
      setMealLogs([]);
      return;
    }
    try {
      await signInStudentWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Google Sign-In popup was closed or blocked in preview.';
      setAuthError(
        `Authentication notice: ${msg}. Your interactive Student Session remains active locally.`
      );
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = profileNameInput.trim().slice(0, 100) || account.fullName;
    const cleanRoom = profileRoomInput.trim().slice(0, 20) || account.roomNumber;
    const cleanBlock = profileBlockInput.trim().slice(0, 60) || account.hostelBlock;
    setAccount((prev) => ({
      ...prev,
      fullName: cleanName,
      roomNumber: cleanRoom,
      hostelBlock: cleanBlock,
    }));
    setIsEditingProfile(false);
    setLastSuccessBanner(`Updated resident profile for ${cleanName} (${cleanRoom}).`);
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F4F3EF] flex flex-col">
      {/* Top Bar Contract: Zone 1 (1-line Brand Wordmark) — Zone 2 (4 single-line Nav Links) — Zone 3 (1 Primary Action) */}
      <header className="sticky top-0 z-30 border-b border-[#23262D] bg-[#0B0C0E]/95 backdrop-blur-md">
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={() => setActivePage('student')}
            className="text-lg font-bold tracking-tight text-[#F4F3EF] whitespace-nowrap shrink-0 font-display"
          >
            Mess Tokens
          </a>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#9CA3AF]"
          >
            <a
              href="#meal-terminal"
              onClick={() => setActivePage('student')}
              className={`hover:text-[#F4F3EF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activePage === 'student' ? 'text-[#F4F3EF]' : ''
              }`}
            >
              Student Portal
            </a>
            <a
              href="#billing-ledger"
              onClick={() => setActivePage('student')}
              className="hover:text-[#F4F3EF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Billing &amp; Trends
            </a>
            <a
              href="#admin-forecast-page"
              onClick={(e) => {
                e.preventDefault();
                setActivePage('admin');
              }}
              className={`hover:text-[#F4F3EF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activePage === 'admin' ? 'text-[#E05A33] font-semibold' : ''
              }`}
            >
              Admin Forecast
            </a>
            <a
              href="#schema-section"
              onClick={() => setActivePage('student')}
              className="hover:text-[#F4F3EF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Stage 1 Schema
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action Button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleAuthAction}
              className="px-4 py-2 text-xs font-semibold text-[#F4F3EF] bg-[#E05A33] hover:bg-[#C94B27] transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2 cursor-pointer"
            >
              {firebaseUser ? (
                <>
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out · {firebaseUser.displayName?.split(' ')[0] || 'Student'}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8">
        {/* Workspace View Switcher Bar (Always accessible on Desktop & Mobile) */}
        <div className="mb-8 pb-4 border-b border-[#23262D] flex flex-wrap items-center justify-between gap-4">
          <div
            role="group"
            aria-label="Select Workspace View"
            className="flex items-center gap-1 p-1 bg-[#111317] border border-[#23262D]"
          >
            <button
              type="button"
              onClick={() => setActivePage('student')}
              aria-pressed={activePage === 'student'}
              className={`px-4 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activePage === 'student'
                  ? 'bg-[#E05A33] text-[#F4F3EF]'
                  : 'text-[#9CA3AF] hover:text-[#F4F3EF]'
              }`}
            >
              Student Token &amp; Skip Portal
            </button>
            <button
              type="button"
              onClick={() => setActivePage('admin')}
              aria-pressed={activePage === 'admin'}
              className={`px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activePage === 'admin'
                  ? 'bg-[#E05A33] text-[#F4F3EF]'
                  : 'text-[#9CA3AF] hover:text-[#F4F3EF]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Admin Forecast Page (Tomorrow&apos;s Meals)</span>
            </button>
          </div>

          <div className="text-xs text-[#9CA3AF] font-mono tabular-nums">
            <span>Simulated Clock: {skipCutoffStatus.clock.formatted}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>Tomorrow Date: {targetMealDate}</span>
          </div>
        </div>

        {activePage === 'admin' ? (
          <AdminForecastPage
            forecastDate={targetMealDate}
            studentAccount={account}
            studentLogs={mealLogs}
          />
        ) : (
          <>
            {/* Hero & Live Balance Proposition Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pb-10 border-b border-[#23262D]">
              <div className="lg:col-span-7 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF] mb-4">
                    <span>Hostel Dietary Credit System</span>
                    <span aria-hidden="true">·</span>
                    <span>Cycle {account.currentMonth}</span>
                    <span aria-hidden="true">·</span>
                    <span>Roll {account.studentId}</span>
                    <span aria-hidden="true">·</span>
                    <span>{account.hostelBlock}</span>
                  </div>

                  <h1
                    className="text-4xl sm:text-5xl font-bold tracking-tight text-[#F4F3EF] leading-[1.08]"
                    style={{
                      fontSize: 'clamp(2.25rem, 3.8vw, 3.5rem)',
                      textWrap: 'balance',
                    }}
                  >
                    Hostel Meal Token Ledger, Pre-8PM Skip Refunds &amp; Rollover.
                  </h1>

                  <p className="mt-5 text-base text-[#9CA3AF] max-w-[64ch] leading-relaxed">
                    Each resident starts with{' '}
                    <strong className="text-[#F4F3EF] font-medium">60 monthly tokens</strong>{' '}
                    (Breakfast 1T, Lunch 2T, Dinner 2T, Guest 2×). Skips logged{' '}
                    <strong className="text-[#F4F3EF] font-medium">
                      before 8:00 PM the previous day
                    </strong>{' '}
                    refund half the meal&apos;s tokens rounded down (
                    <code className="font-mono text-xs text-[#F4F3EF]">⌊base ÷ 2⌋</code>), and
                    unused monthly tokens roll over to the next month{' '}
                    <strong className="text-[#F4F3EF] font-medium">capped at 10 tokens</strong>.
                  </p>
                </div>

                {/* Resident Account Bar & Quick Calibration Controls */}
                <div className="mt-8 pt-6 border-t border-[#23262D] flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-[#9CA3AF] flex flex-wrap items-center gap-2">
                    <span className="text-[#F4F3EF] font-semibold">{account.fullName}</span>
                    <span aria-hidden="true">·</span>
                    <span>Room {account.roomNumber}</span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileNameInput(account.fullName);
                        setProfileRoomInput(account.roomNumber);
                        setProfileBlockInput(account.hostelBlock);
                        setIsEditingProfile((v) => !v);
                      }}
                      className="text-[#E05A33] hover:underline font-medium cursor-pointer whitespace-nowrap"
                    >
                      {isEditingProfile ? 'Cancel Edit' : 'Edit Resident Info'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSimulateSevenTokensBalance}
                      className="px-3 py-1.5 text-xs font-medium text-[#D1D5DB] bg-[#16191F] hover:bg-[#1E222B] border border-[#2A2E37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Set 7 Unused Tokens
                    </button>
                    <button
                      type="button"
                      onClick={handleSimulateLowBalance}
                      className="px-3 py-1.5 text-xs font-medium text-[#D1D5DB] bg-[#16191F] hover:bg-[#1E222B] border border-[#2A2E37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Test Low Balance (1 Token)
                    </button>
                    <button
                      type="button"
                      onClick={handleResetMonthlyTokens}
                      className="px-3 py-1.5 text-xs font-medium text-[#D1D5DB] bg-[#16191F] hover:bg-[#1E222B] border border-[#2A2E37] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Month (60 Tokens)</span>
                    </button>
                  </div>
                </div>

                {isEditingProfile && (
                  <form
                    onSubmit={handleSaveProfile}
                    className="mt-4 p-4 border border-[#2A2E37] bg-[#111317] grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
                  >
                    <div>
                      <label
                        htmlFor="resident-name-input"
                        className="block text-xs text-[#9CA3AF] mb-1"
                      >
                        Resident Name
                      </label>
                      <input
                        id="resident-name-input"
                        type="text"
                        value={profileNameInput}
                        onChange={(e) => setProfileNameInput(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF]"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="resident-room-input"
                        className="block text-xs text-[#9CA3AF] mb-1"
                      >
                        Room Number
                      </label>
                      <input
                        id="resident-room-input"
                        type="text"
                        value={profileRoomInput}
                        onChange={(e) => setProfileRoomInput(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF]"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="resident-block-input"
                        className="block text-xs text-[#9CA3AF] mb-1"
                      >
                        Hostel Wing
                      </label>
                      <input
                        id="resident-block-input"
                        type="text"
                        value={profileBlockInput}
                        onChange={(e) => setProfileBlockInput(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF]"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-1.5 text-xs font-semibold bg-[#E05A33] text-[#F4F3EF] hover:bg-[#C94B27] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Save Profile
                    </button>
                  </form>
                )}
              </div>

              {/* Dominant Focal Carrier: Architectural Token Balance Vault */}
              <div className="lg:col-span-5 border border-[#23262D] bg-[#111317] p-7 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-4 pb-5 border-b border-[#23262D]">
                  <div>
                    <p className="text-xs text-[#9CA3AF]">Available Dietary Balance</p>
                    <p
                      data-testid="active-billing-cycle"
                      className="text-xs text-[#6B7280] mt-0.5 font-mono tabular-nums"
                    >
                      {account.studentId} · Cycle {account.currentMonth}
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#D1D5DB]">
                    Floor: 0T · Rollover Cap: 10T
                  </span>
                </div>

                <div className="py-6 flex items-baseline justify-between gap-4">
                  <div>
                    <div
                      data-testid="available-token-balance"
                      className="text-6xl sm:text-7xl font-bold font-mono tabular-nums tracking-tight text-[#F4F3EF]"
                    >
                      {account.tokenBalance}
                    </div>
                    <p className="text-xs text-[#9CA3AF] mt-2">
                      Spendable tokens (60 base
                      {account.rolloverTokens > 0
                        ? ` + ${account.rolloverTokens} rollover`
                        : ''}
                      {account.tokensRefunded > 0
                        ? ` + ${account.tokensRefunded} skip refund`
                        : ''}
                      )
                    </p>
                  </div>

                  <div className="text-right font-mono tabular-nums space-y-1">
                    <div className="text-xl font-semibold text-[#E05A33]">
                      -{account.tokensUsed}T Used
                    </div>
                    <div
                      data-testid="tokens-refunded-badge"
                      className="text-sm font-semibold text-[#22C55E]"
                    >
                      +{account.tokensRefunded}T Refunded
                    </div>
                    <p className="text-xs text-[#9CA3AF]">
                      {account.skipsLoggedCount}{' '}
                      {account.skipsLoggedCount === 1 ? 'skip' : 'skips'} logged
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="w-full h-2 bg-[#0B0C0E] border border-[#23262D] overflow-hidden">
                    <div
                      className="h-full bg-[#E05A33] transition-transform duration-200 origin-left"
                      style={{
                        transform: `scaleX(${Math.min(
                          1,
                          Math.max(0, account.tokenBalance / account.monthlyAllowance)
                        )})`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#9CA3AF] mt-3 font-mono tabular-nums">
                    <span>Skip Refund: ⌊Base ÷ 2⌋ (L/D = +1T)</span>
                    <span>·</span>
                    <span>Next Rollover: {rolloverPreview.rolloverTokens}/10T</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Simulated Hostel Clock (with Dropdown Selector) & Monthly Rollover Command Bar */}
            <section
              id="rollover-panel"
              aria-label="Simulated Clock and Monthly Rollover Controls"
              className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Simulated Clock Controller (7 cols) */}
              <div className="lg:col-span-7 border border-[#23262D] bg-[#111317] p-5 flex flex-col justify-between gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#23262D]">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#E05A33] shrink-0" />
                    <h2 className="text-sm font-semibold text-[#F4F3EF]">
                      Simulated Hostel Clock (Enforces 8:00 PM Previous-Day Skip Cutoff)
                    </h2>
                  </div>
                  <span
                    data-testid="simulated-clock-display"
                    className="text-xs font-mono tabular-nums text-[#F4F3EF]"
                  >
                    Clock: {skipCutoffStatus.clock.formatted}
                  </span>
                </div>

                {/* Dropdown Option for Changing Simulated Current Date & Time + Individual Date/Time Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6">
                    <label
                      htmlFor="simulated-clock-dropdown"
                      className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                    >
                      Select Simulated Date &amp; Time Preset (Dropdown)
                    </label>
                    <select
                      id="simulated-clock-dropdown"
                      data-testid="simulated-clock-dropdown"
                      value={
                        SIMULATED_CLOCK_PRESET_OPTIONS.some((o) => o.value === simulatedClock)
                          ? simulatedClock
                          : 'custom'
                      }
                      onChange={(e) => {
                        const chosen = SIMULATED_CLOCK_PRESET_OPTIONS.find(
                          (o) => o.value === e.target.value
                        );
                        if (chosen) {
                          setSimulatedClock(chosen.value);
                          setTargetMealDate(chosen.targetMealDate);
                          setSkipError(null);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs font-mono bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
                    >
                      {SIMULATED_CLOCK_PRESET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      {!SIMULATED_CLOCK_PRESET_OPTIONS.some(
                        (o) => o.value === simulatedClock
                      ) && <option value="custom">Custom: {simulatedClock}</option>}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="simulated-date-dropdown"
                      className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                    >
                      Clock Date Dropdown
                    </label>
                    <select
                      id="simulated-date-dropdown"
                      data-testid="simulated-date-dropdown"
                      value={simulatedDatePart}
                      onChange={(e) => {
                        setSimulatedClock(`${e.target.value}T${simulatedTimePart}`);
                        setSkipError(null);
                      }}
                      className="w-full px-3 py-2 text-xs font-mono bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
                    >
                      {SIMULATED_DATE_OPTIONS.map((dOpt) => (
                        <option key={dOpt.value} value={dOpt.value}>
                          {dOpt.value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="simulated-time-dropdown"
                      className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                    >
                      Clock Time Dropdown
                    </label>
                    <select
                      id="simulated-time-dropdown"
                      data-testid="simulated-time-dropdown"
                      value={simulatedTimePart}
                      onChange={(e) => {
                        setSimulatedClock(`${simulatedDatePart}T${e.target.value}`);
                        setSkipError(null);
                      }}
                      className="w-full px-3 py-2 text-xs font-mono bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
                    >
                      {SIMULATED_TIME_OPTIONS.map((tOpt) => (
                        <option key={tOpt.value} value={tOpt.value}>
                          {tOpt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Custom Datetime Input & Quick Preset Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div>
                    <label
                      htmlFor="simulated-clock-input"
                      className="block text-xs font-medium text-[#9CA3AF] mb-1.5"
                    >
                      Or Enter Exact Custom Date &amp; Time
                    </label>
                    <input
                      id="simulated-clock-input"
                      data-testid="simulated-clock-input"
                      type="datetime-local"
                      value={simulatedClock}
                      onChange={(e) => {
                        setSimulatedClock(e.target.value);
                        setSkipError(null);
                      }}
                      className="w-full px-3 py-2 text-xs font-mono bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMealDate('2026-10-30');
                        setSimulatedClock('2026-10-29T18:30');
                        setSkipError(null);
                      }}
                      className="px-3 py-2 text-xs font-medium bg-[#16191F] hover:bg-[#1E222B] border border-[#2A2E37] text-[#D1D5DB] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Preset: Valid (Prev Day 6:30 PM)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMealDate('2026-10-30');
                        setSimulatedClock('2026-10-29T21:15');
                        setSkipError(null);
                      }}
                      className="px-3 py-2 text-xs font-medium bg-[#16191F] hover:bg-[#1E222B] border border-[#2A2E37] text-[#D1D5DB] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Preset: Late (Prev Day 9:15 PM)
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9CA3AF] pt-2 border-t border-[#1E2026] font-mono tabular-nums">
                  <span>
                    Target Meal Date:{' '}
                    <strong className="text-[#F4F3EF]">{targetMealDate}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Skip Cutoff:{' '}
                    <strong className="text-[#F4F3EF]">
                      {skipCutoffStatus.cutoff.cutoffFormatted}
                    </strong>
                  </span>
                  <span>·</span>
                  <span
                    data-testid="skip-window-eligibility"
                    className={
                      skipCutoffStatus.isBeforeDeadline
                        ? 'text-[#22C55E] font-semibold'
                        : 'text-[#FCA5A5] font-semibold'
                    }
                  >
                    {skipCutoffStatus.isBeforeDeadline
                      ? 'Cutoff Status: OPEN (Before 8 PM Prev Day)'
                      : 'Cutoff Status: CLOSED (Past 8 PM Prev Day)'}
                  </span>
                </div>
              </div>

              {/* Monthly Rollover Controller (5 cols) */}
              <div className="lg:col-span-5 border border-[#23262D] bg-[#111317] p-5 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#23262D]">
                  <div className="flex items-center gap-2">
                    <FastForward className="w-4 h-4 text-[#E05A33] shrink-0" />
                    <h2 className="text-sm font-semibold text-[#F4F3EF]">
                      Unused Token Monthly Rollover (Capped at 10T)
                    </h2>
                  </div>
                  <span
                    data-testid="rollover-active-stat"
                    className="text-xs font-mono tabular-nums text-[#22C55E]"
                  >
                    Active Carryover: +{account.rolloverTokens}T
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                  <div className="p-2.5 bg-[#0B0C0E] border border-[#1E2026]">
                    <span className="text-[#9CA3AF] block text-[11px]">Unused Balance</span>
                    <span className="text-base font-bold text-[#F4F3EF]">
                      {account.tokenBalance}T
                    </span>
                  </div>
                  <div className="p-2.5 bg-[#0B0C0E] border border-[#1E2026]">
                    <span className="text-[#9CA3AF] block text-[11px]">Rollover (≤10T)</span>
                    <span
                      data-testid="projected-rollover-tokens"
                      className="text-base font-bold text-[#22C55E]"
                    >
                      +{rolloverPreview.rolloverTokens}T
                    </span>
                  </div>
                  <div className="p-2.5 bg-[#0B0C0E] border border-[#1E2026]">
                    <span className="text-[#9CA3AF] block text-[11px]">Next Month Start</span>
                    <span
                      data-testid="projected-next-month-allowance"
                      className="text-base font-bold text-[#F4F3EF]"
                    >
                      {rolloverPreview.nextMonthOpeningAllowance}T
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
                    Expired above 10T cap: {rolloverPreview.forfeitedTokens}T
                  </span>
                  <button
                    type="button"
                    onClick={handleRolloverToNextMonth}
                    className="px-3.5 py-2 text-xs font-semibold bg-[#16191F] hover:bg-[#E05A33] text-[#F4F3EF] border border-[#2A2E37] hover:border-[#E05A33] transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Roll Over to Next Month (+{rolloverPreview.rolloverTokens}T)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </section>

            {/* Full-Width 4-Column KPI Strip */}
            <section
              aria-label="Monthly Token Telemetry"
              className="mt-8 grid grid-cols-2 lg:grid-cols-4 border-t border-b border-[#23262D]"
            >
              <div className="py-5 pr-6 border-b lg:border-b-0 border-r border-[#23262D]">
                <p className="text-xs text-[#9CA3AF]">Opening Monthly Credit</p>
                <p
                  data-testid="opening-monthly-credit"
                  className="text-2xl font-semibold font-mono tabular-nums text-[#F4F3EF] mt-1"
                >
                  {billingSummary.openingAllowance} Tokens
                </p>
                <p className="text-xs text-[#6B7280] mt-1 font-mono tabular-nums">
                  60 Base + {billingSummary.rolloverTokens} Rollover (Cap 10T)
                </p>
              </div>

              <div className="py-5 px-6 border-b lg:border-b-0 lg:border-r border-[#23262D]">
                <p className="text-xs text-[#9CA3AF]">Tokens Redeemed</p>
                <p
                  data-testid="tokens-used-stat"
                  className="text-2xl font-semibold font-mono tabular-nums text-[#F4F3EF] mt-1"
                >
                  {billingSummary.tokensUsed} Tokens ({billingSummary.utilizationPercent}%)
                </p>
                <p className="text-xs text-[#6B7280] mt-1">
                  Regular: {billingSummary.regularMealsTokens}T · Guest:{' '}
                  {billingSummary.guestMealsTokens}T
                </p>
              </div>

              <div className="py-5 pr-6 lg:px-6 border-r border-[#23262D]">
                <p className="text-xs text-[#9CA3AF]">Pre-8PM Skip Refunds</p>
                <p
                  data-testid="skip-refunds-stat"
                  className="text-2xl font-semibold font-mono tabular-nums text-[#22C55E] mt-1"
                >
                  +{billingSummary.tokensRefunded} Tokens
                </p>
                <p className="text-xs text-[#6B7280] mt-1 tabular-nums">
                  {account.skipsLoggedCount} valid{' '}
                  {account.skipsLoggedCount === 1 ? 'skip' : 'skips'} · ⌊Base ÷ 2⌋ rule
                </p>
              </div>

              <div className="py-5 pl-6">
                <p className="text-xs text-[#9CA3AF]">Next Month Rollover Preview</p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-[#F4F3EF] mt-1">
                  +{billingSummary.projectedRolloverNextMonth} Tokens
                </p>
                <p className="text-xs text-[#6B7280] mt-1 tabular-nums">
                  Starts next cycle with {60 + billingSummary.projectedRolloverNextMonth}T
                </p>
              </div>
            </section>

            {/* Auth Error Notice if popup was blocked */}
            {authError && (
              <div
                role="status"
                className="mt-6 p-4 border border-[#D97706] bg-[#D97706]/10 text-xs text-[#FDE68A] flex items-center justify-between gap-4"
              >
                <span>{authError}</span>
                <button
                  type="button"
                  onClick={() => setAuthError(null)}
                  className="underline font-medium shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Section 01: Interactive Meal & Skip Terminal + Token Matrix */}
            <section
              id="meal-terminal"
              aria-labelledby="terminal-heading"
              className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Left Column (5 cols): Meal Token Logger & Skip Terminal Form */}
              <div className="lg:col-span-5 border border-[#23262D] bg-[#111317] p-6">
                <div className="pb-5 border-b border-[#23262D] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#9CA3AF]">
                      01. Daily Dietary Redemption &amp; Skip
                    </p>
                    <h2
                      id="terminal-heading"
                      className="text-xl font-semibold text-[#F4F3EF] mt-1"
                    >
                      {terminalMode === 'eat'
                        ? 'Log Hostel Meal & Deduct Tokens'
                        : 'Skip Meal & Claim ⌊½⌋ Token Refund'}
                    </h2>
                  </div>

                  {/* Mode Switcher: Log Meal vs Skip Meal */}
                  <div
                    role="group"
                    aria-label="Terminal Action Mode"
                    className="flex items-center gap-1 p-1 bg-[#0B0C0E] border border-[#23262D]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTerminalMode('eat');
                        setSkipError(null);
                        setOverdraftError(null);
                      }}
                      aria-pressed={terminalMode === 'eat'}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        terminalMode === 'eat'
                          ? 'bg-[#E05A33] text-[#F4F3EF]'
                          : 'text-[#9CA3AF] hover:text-[#F4F3EF]'
                      }`}
                    >
                      Eat Meal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTerminalMode('skip');
                        setSkipError(null);
                        setOverdraftError(null);
                      }}
                      aria-pressed={terminalMode === 'skip'}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        terminalMode === 'skip'
                          ? 'bg-[#E05A33] text-[#F4F3EF]'
                          : 'text-[#9CA3AF] hover:text-[#F4F3EF]'
                      }`}
                    >
                      Skip Meal (Refund)
                    </button>
                  </div>
                </div>

                <form onSubmit={handleTerminalSubmit} className="mt-6 space-y-6">
                  {/* Step 1: Select Meal Session */}
                  <fieldset>
                    <legend className="text-xs font-medium text-[#D1D5DB] mb-3">
                      {terminalMode === 'eat'
                        ? 'Select Meal Session (Standard Rate: Breakfast 1T · Lunch 2T · Dinner 2T)'
                        : 'Select Meal to Skip (Refunds Half of Base Tokens Rounded Down: ⌊Base ÷ 2⌋)'}
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(['breakfast', 'lunch', 'dinner'] as MealType[]).map((mType) => {
                        const meta = MEAL_METADATA[mType];
                        const isSelected = selectedMeal === mType;
                        const effectiveCost = isGuestMeal
                          ? meta.guestTokens
                          : meta.baseTokens;
                        return (
                          <button
                            key={mType}
                            type="button"
                            onClick={() => handleSelectMealType(mType)}
                            aria-pressed={isSelected}
                            className={`p-3.5 text-left border transition-colors cursor-pointer flex sm:flex-col items-center sm:items-start justify-between gap-2 ${
                              isSelected
                                ? 'border-[#E05A33] bg-[#E05A33]/12 text-[#F4F3EF]'
                                : 'border-[#2A2E37] bg-[#0B0C0E] text-[#9CA3AF] hover:border-[#4B5563] hover:text-[#F4F3EF]'
                            }`}
                          >
                            <div className="flex items-center justify-between sm:w-full gap-2">
                              <span className="text-xs font-semibold text-[#F4F3EF] whitespace-nowrap">
                                {meta.label}
                              </span>
                              {mType === 'breakfast' && (
                                <Coffee className="w-3.5 h-3.5 shrink-0" />
                              )}
                              {mType === 'lunch' && <Sun className="w-3.5 h-3.5 shrink-0" />}
                              {mType === 'dinner' && (
                                <Moon className="w-3.5 h-3.5 shrink-0" />
                              )}
                            </div>
                            <div className="sm:mt-3 font-mono tabular-nums text-right sm:text-left">
                              {terminalMode === 'eat' ? (
                                <span className="text-base sm:text-lg font-bold text-[#F4F3EF] whitespace-nowrap block">
                                  {effectiveCost} {effectiveCost === 1 ? 'Token' : 'Tokens'}
                                </span>
                              ) : (
                                <span className="text-base sm:text-lg font-bold text-[#22C55E] whitespace-nowrap block">
                                  +{meta.skipRefundTokens}T Refund
                                </span>
                              )}
                              <span className="block text-[11px] text-[#9CA3AF] mt-0.5 whitespace-nowrap">
                                {terminalMode === 'eat'
                                  ? meta.window
                                  : `Base ${meta.baseTokens}T → ⌊${meta.baseTokens}/2⌋`}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2.5 text-xs text-[#9CA3AF]">
                      Menu: {MEAL_METADATA[selectedMeal].menuSummary}
                    </p>
                  </fieldset>

                  {terminalMode === 'eat' ? (
                    <>
                      {/* Eat Mode Step 2: Guest Meal 2x Multiplier Selector */}
                      <fieldset>
                        <legend className="text-xs font-medium text-[#D1D5DB] mb-2.5">
                          Meal Rate Tier (Guest Meals Cost 2× Standard Tokens)
                        </legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleToggleGuestMeal(false)}
                            aria-pressed={!isGuestMeal}
                            className={`px-3.5 py-2.5 text-xs font-medium border text-left transition-colors cursor-pointer ${
                              !isGuestMeal
                                ? 'border-[#E05A33] bg-[#E05A33]/12 text-[#F4F3EF]'
                                : 'border-[#2A2E37] bg-[#0B0C0E] text-[#9CA3AF] hover:text-[#F4F3EF]'
                            }`}
                          >
                            <div className="font-semibold text-[#F4F3EF] whitespace-nowrap">
                              Resident Meal (1×)
                            </div>
                            <div className="text-[11px] text-[#9CA3AF] font-mono tabular-nums mt-0.5 whitespace-nowrap">
                              Standard rate: {MEAL_METADATA[selectedMeal].baseTokens}T
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleGuestMeal(true)}
                            aria-pressed={isGuestMeal}
                            className={`px-3.5 py-2.5 text-xs font-medium border text-left transition-colors cursor-pointer ${
                              isGuestMeal
                                ? 'border-[#E05A33] bg-[#E05A33]/12 text-[#F4F3EF]'
                                : 'border-[#2A2E37] bg-[#0B0C0E] text-[#9CA3AF] hover:text-[#F4F3EF]'
                            }`}
                          >
                            <div className="font-semibold text-[#F4F3EF] inline-flex items-center gap-1.5 whitespace-nowrap">
                              <Users className="w-3.5 h-3.5 text-[#E05A33] shrink-0" />
                              <span>Guest Meal (2× Double)</span>
                            </div>
                            <div className="text-[11px] text-[#9CA3AF] font-mono tabular-nums mt-0.5 whitespace-nowrap">
                              Double rate: {MEAL_METADATA[selectedMeal].guestTokens}T
                            </div>
                          </button>
                        </div>
                      </fieldset>

                      {/* Eat Mode Step 3: Dining Hall Counter & Notes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="dining-counter-select"
                            className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                          >
                            Mess Hall Counter
                          </label>
                          <select
                            id="dining-counter-select"
                            value={diningCounter}
                            onChange={(e) => setDiningCounter(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
                          >
                            {DINING_COUNTERS.map((counter) => (
                              <option key={counter} value={counter}>
                                {counter}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="meal-notes-input"
                            className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                          >
                            Note / Guest Reference (Optional)
                          </label>
                          <input
                            id="meal-notes-input"
                            type="text"
                            maxLength={200}
                            placeholder={
                              isGuestMeal
                                ? 'e.g. Visiting parent / project teammate'
                                : 'e.g. Extra curd'
                            }
                            value={mealNotes}
                            onChange={(e) => setMealNotes(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E05A33]"
                          />
                        </div>
                      </div>

                      {/* Eat Mode Live Calculation Summary Box */}
                      <div className="p-4 bg-[#0B0C0E] border border-[#23262D] space-y-2 text-xs font-mono tabular-nums">
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>Current Balance:</span>
                          <span className="text-[#F4F3EF]">
                            {account.tokenBalance}{' '}
                            {account.tokenBalance === 1 ? 'Token' : 'Tokens'}
                          </span>
                        </div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>
                            Selected ({isGuestMeal ? 'Guest 2× ' : 'Resident 1× '}
                            {MEAL_METADATA[selectedMeal].label}):
                          </span>
                          <span className="text-[#E05A33] font-semibold">
                            -{currentCostPreview.tokenCost}{' '}
                            {currentCostPreview.tokenCost === 1 ? 'Token' : 'Tokens'}
                          </span>
                        </div>
                        <div className="pt-2 border-t border-[#1E2026] flex justify-between font-semibold">
                          <span className="text-[#D1D5DB]">
                            Projected Balance After Meal:
                          </span>
                          <span
                            className={
                              wouldOverdraft ? 'text-[#FCA5A5]' : 'text-[#F4F3EF]'
                            }
                          >
                            {wouldOverdraft
                              ? `OVERDRAFT (${
                                  account.tokenBalance - currentCostPreview.tokenCost
                                }T Blocked)`
                              : `${account.tokenBalance - currentCostPreview.tokenCost} ${
                                  account.tokenBalance - currentCostPreview.tokenCost === 1
                                    ? 'Token'
                                    : 'Tokens'
                                }`}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Skip Mode Step 2: Target Meal Date & Reason */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="skip-target-date-input"
                            className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                          >
                            Date of Meal to Skip
                          </label>
                          <input
                            id="skip-target-date-input"
                            data-testid="skip-target-date-input"
                            type="date"
                            value={targetMealDate}
                            onChange={(e) => {
                              setTargetMealDate(e.target.value);
                              setSkipError(null);
                            }}
                            className="w-full px-3 py-2 text-xs font-mono bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
                            required
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="skip-notes-input"
                            className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                          >
                            Skip Reason (Optional)
                          </label>
                          <input
                            id="skip-notes-input"
                            type="text"
                            maxLength={200}
                            placeholder="e.g. Away for academic workshop"
                            value={mealNotes}
                            onChange={(e) => setMealNotes(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E05A33]"
                          />
                        </div>
                      </div>

                      {/* Skip Mode Live Refund & Cutoff Summary Box */}
                      <div className="p-4 bg-[#0B0C0E] border border-[#23262D] space-y-2 text-xs font-mono tabular-nums">
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>Required Cutoff (8 PM Prev Day):</span>
                          <span className="text-[#F4F3EF]">
                            {skipCutoffStatus.cutoff.cutoffFormatted}
                          </span>
                        </div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>Simulated Clock Time:</span>
                          <span
                            className={
                              skipCutoffStatus.isBeforeDeadline
                                ? 'text-[#22C55E]'
                                : 'text-[#FCA5A5]'
                            }
                          >
                            {skipCutoffStatus.clock.formatted}
                          </span>
                        </div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>
                            Skip Refund Formula (⌊{currentSkipPreview.baseCost} ÷ 2⌋):
                          </span>
                          <span className="text-[#22C55E] font-semibold">
                            +{currentSkipPreview.refundTokens}{' '}
                            {currentSkipPreview.refundTokens === 1 ? 'Token' : 'Tokens'}
                          </span>
                        </div>
                        <div className="pt-2 border-t border-[#1E2026] flex justify-between font-semibold">
                          <span className="text-[#D1D5DB]">
                            Projected Balance After Skip:
                          </span>
                          <span className="text-[#F4F3EF]">
                            {account.tokenBalance + currentSkipPreview.refundTokens} Tokens
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Pre-Submit Overdraft Warning or Explicit Blocked Alert */}
                  {terminalMode === 'eat' && (overdraftError || wouldOverdraft) && (
                    <div
                      role="alert"
                      data-testid="overdraft-alert"
                      className="p-4 border border-[#DC2626] bg-[#DC2626]/12 text-[#FCA5A5] text-xs space-y-1.5"
                    >
                      <div className="flex items-center gap-2 font-semibold text-[#FEE2E2]">
                        <ShieldAlert className="w-4 h-4 text-[#DC2626] shrink-0" />
                        <span>Zero-Balance Guard: Overdraft Blocked</span>
                      </div>
                      <p className="leading-relaxed">
                        {overdraftError
                          ? overdraftError.message
                          : `Overdraft Blocked: ${
                              isGuestMeal ? 'Guest ' : ''
                            }${MEAL_METADATA[selectedMeal].label} costs ${
                              currentCostPreview.tokenCost
                            } tokens, which exceeds your remaining balance of ${
                              account.tokenBalance
                            } ${
                              account.tokenBalance === 1 ? 'token' : 'tokens'
                            }. Balance can never go below zero.`}
                      </p>
                    </div>
                  )}

                  {/* Skip Cutoff or Duplicate Alert */}
                  {terminalMode === 'skip' &&
                    (skipError || !skipCutoffStatus.isBeforeDeadline) && (
                      <div
                        role="alert"
                        data-testid="skip-deadline-alert"
                        className="p-4 border border-[#DC2626] bg-[#DC2626]/12 text-[#FCA5A5] text-xs space-y-1.5"
                      >
                        <div className="flex items-center gap-2 font-semibold text-[#FEE2E2]">
                          <CalendarClock className="w-4 h-4 text-[#DC2626] shrink-0" />
                          <span>
                            Skip Deadline Guard: Must Log Before 8:00 PM Previous Day
                          </span>
                        </div>
                        <p className="leading-relaxed">
                          {skipError
                            ? skipError
                            : `Skip Blocked — Past 8:00 PM Previous-Day Cutoff: To skip ${MEAL_METADATA[selectedMeal].label} on ${targetMealDate}, you must log the skip before ${skipCutoffStatus.cutoff.cutoffFormatted}. Current simulated clock is ${skipCutoffStatus.clock.formatted}.`}
                        </p>
                      </div>
                    )}

                  {/* Success Confirmation Alert */}
                  {lastSuccessBanner && !overdraftError && !skipError && (
                    <div
                      role="status"
                      data-testid="meal-logged-status"
                      className="p-3.5 border border-[#16A34A] bg-[#16A34A]/12 text-[#BBF7D0] text-xs flex items-start gap-2.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
                      <span>{lastSuccessBanner}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full py-3 px-4 text-xs font-semibold tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                      (terminalMode === 'eat' && wouldOverdraft) ||
                      (terminalMode === 'skip' && !skipCutoffStatus.isBeforeDeadline)
                        ? 'border border-[#DC2626] bg-[#DC2626]/20 hover:bg-[#DC2626]/30 text-[#FEE2E2]'
                        : 'bg-[#E05A33] hover:bg-[#C94B27] text-[#F4F3EF]'
                    }`}
                  >
                    <Utensils className="w-4 h-4 shrink-0" />
                    {terminalMode === 'eat' ? (
                      <span>
                        Log {isGuestMeal ? 'Guest ' : ''}
                        {MEAL_METADATA[selectedMeal].label} (-{currentCostPreview.tokenCost}{' '}
                        {currentCostPreview.tokenCost === 1 ? 'Token' : 'Tokens'})
                      </span>
                    ) : (
                      <span>
                        Log {MEAL_METADATA[selectedMeal].label} Skip (+
                        {currentSkipPreview.refundTokens}{' '}
                        {currentSkipPreview.refundTokens === 1 ? 'Token' : 'Tokens'} Refund)
                      </span>
                    )}
                  </button>
                </form>
              </div>

              {/* Right Column (7 cols): Token Punch Matrix & Monthly Tariff Schedule */}
              <div id="punch-matrix" className="lg:col-span-7 space-y-6">
                <PunchGridVisualizer
                  monthlyAllowance={account.monthlyAllowance}
                  rolloverTokens={account.rolloverTokens}
                  tokenBalance={account.tokenBalance}
                  tokensUsed={account.tokensUsed}
                  tokensRefunded={account.tokensRefunded}
                  pendingCost={terminalMode === 'eat' ? currentCostPreview.tokenCost : 0}
                  wouldOverdraft={wouldOverdraft}
                />

                {/* Tariff, Skip Refund & Monthly Billing Rules Schedule */}
                <div className="border border-[#23262D] bg-[#111317] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#23262D]">
                    <div>
                      <h3 className="text-base font-semibold text-[#F4F3EF]">
                        Hostel Mess Token Tariff, Skip Refund &amp; Rollover Schedule
                      </h3>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        Resident rates, 2× guest multiplier, and pre-8PM previous-day skip
                        refunds
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                      Base: 60T · Max Rollover: +10T
                    </span>
                  </div>

                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#23262D] text-[#9CA3AF]">
                          <th className="py-2.5 pr-4 font-medium">Meal Session</th>
                          <th className="py-2.5 px-4 font-medium">Resident Rate</th>
                          <th className="py-2.5 px-4 font-medium text-right">
                            Guest Rate (2×)
                          </th>
                          <th className="py-2.5 px-4 font-medium text-right">
                            Valid Skip Refund (⌊½⌋)
                          </th>
                          <th className="py-2.5 pl-4 font-medium text-right">
                            Logged ({account.currentMonth})
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E2026] font-mono tabular-nums">
                        <tr>
                          <td className="py-3 pr-4 font-sans font-medium text-[#F4F3EF]">
                            Breakfast
                          </td>
                          <td className="py-3 px-4 text-[#F4F3EF] whitespace-nowrap">
                            1 Token
                          </td>
                          <td className="py-3 px-4 text-right text-[#E05A33] whitespace-nowrap">
                            2 Tokens
                          </td>
                          <td className="py-3 px-4 text-right text-[#22C55E] whitespace-nowrap">
                            +0 Tokens (⌊1÷2⌋)
                          </td>
                          <td className="py-3 pl-4 text-right text-[#D1D5DB] whitespace-nowrap">
                            {billingSummary.breakfastCount}{' '}
                            {billingSummary.breakfastCount === 1 ? 'meal' : 'meals'} (
                            {billingSummary.breakfastTokens}T)
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 pr-4 font-sans font-medium text-[#F4F3EF]">
                            Lunch
                          </td>
                          <td className="py-3 px-4 text-[#F4F3EF] whitespace-nowrap">
                            2 Tokens
                          </td>
                          <td className="py-3 px-4 text-right text-[#E05A33] whitespace-nowrap">
                            4 Tokens
                          </td>
                          <td className="py-3 px-4 text-right text-[#22C55E] whitespace-nowrap">
                            +1 Token (⌊2÷2⌋)
                          </td>
                          <td className="py-3 pl-4 text-right text-[#D1D5DB] whitespace-nowrap">
                            {billingSummary.lunchCount}{' '}
                            {billingSummary.lunchCount === 1 ? 'meal' : 'meals'} (
                            {billingSummary.lunchTokens}T)
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 pr-4 font-sans font-medium text-[#F4F3EF]">
                            Dinner
                          </td>
                          <td className="py-3 px-4 text-[#F4F3EF] whitespace-nowrap">
                            2 Tokens
                          </td>
                          <td className="py-3 px-4 text-right text-[#E05A33] whitespace-nowrap">
                            4 Tokens
                          </td>
                          <td className="py-3 px-4 text-right text-[#22C55E] whitespace-nowrap">
                            +1 Token (⌊2÷2⌋)
                          </td>
                          <td className="py-3 pl-4 text-right text-[#D1D5DB] whitespace-nowrap">
                            {billingSummary.dinnerCount}{' '}
                            {billingSummary.dinnerCount === 1 ? 'meal' : 'meals'} (
                            {billingSummary.dinnerTokens}T)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 02: Meal History, Skip Refunds & Monthly Billing Statement Ledger + Recharts Line Chart */}
            <section
              id="billing-ledger"
              aria-labelledby="ledger-heading"
              className="mt-14 pt-12 border-t border-[#23262D]"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
                <div>
                  <p className="text-xs text-[#9CA3AF]">
                    02. Chronological Token Deduction &amp; Skip Refund Audit Trail
                  </p>
                  <h2
                    id="ledger-heading"
                    className="text-2xl sm:text-3xl font-semibold text-[#F4F3EF] mt-1 tracking-tight"
                  >
                    Meal History &amp; Monthly Billing Statement
                  </h2>
                </div>

                {/* Interactive Filter Tabs (Buttons per Zero-Pill Rule) & Search Input */}
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    role="group"
                    aria-label="Filter meal history by type"
                    className="flex items-center gap-1 p-1 bg-[#111317] border border-[#23262D]"
                  >
                    {(
                      [
                        { id: 'all', label: 'All Entries' },
                        { id: 'breakfast', label: 'Breakfast' },
                        { id: 'lunch', label: 'Lunch' },
                        { id: 'dinner', label: 'Dinner' },
                        { id: 'guest', label: 'Guest (2×)' },
                        { id: 'skip', label: 'Skipped Meals' },
                      ] as { id: LedgerFilter; label: string }[]
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setLedgerFilter(tab.id)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          ledgerFilter === tab.id
                            ? 'bg-[#E05A33] text-[#F4F3EF]'
                            : 'text-[#9CA3AF] hover:text-[#F4F3EF]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      aria-label="Search meal history"
                      placeholder="Search counter, skip, note..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-[#111317] border border-[#23262D] text-[#F4F3EF] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E05A33]"
                    />
                  </div>
                </div>
              </div>

              {/* High-Density Ledger Table */}
              <div className="border border-[#23262D] bg-[#111317]">
                {filteredLogs.length === 0 ? (
                  <div
                    data-testid="empty-ledger-state"
                    className="p-12 text-center max-w-md mx-auto space-y-3"
                  >
                    <p className="text-sm font-semibold text-[#F4F3EF]">
                      {mealLogs.length === 0
                        ? 'No meals or skips logged in this billing cycle yet'
                        : 'No ledger entries match the active filter'}
                    </p>
                    <p className="text-xs text-[#9CA3AF] leading-relaxed">
                      {mealLogs.length === 0
                        ? 'Log a meal (Breakfast 1T, Lunch 2T, Dinner 2T) or switch to Skip Meal mode to log a pre-8PM previous-day meal skip.'
                        : 'Clear the search filter or switch back to All Entries to inspect your complete monthly transaction log.'}
                    </p>
                    {mealLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setLedgerFilter('all');
                          setSearchQuery('');
                        }}
                        className="px-4 py-2 text-xs font-semibold bg-[#16191F] border border-[#2A2E37] text-[#F4F3EF] hover:border-[#E05A33] cursor-pointer"
                      >
                        Reset Ledger Filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table
                      data-testid="meal-history-table"
                      className="w-full text-left border-collapse text-xs"
                    >
                      <thead>
                        <tr className="border-b border-[#23262D] bg-[#0B0C0E] text-[#9CA3AF]">
                          <th className="py-3 px-4 font-medium">Logged At</th>
                          <th className="py-3 px-4 font-medium">Meal Date</th>
                          <th className="py-3 px-4 font-medium">Meal Session</th>
                          <th className="py-3 px-4 font-medium">Transaction Type</th>
                          <th className="py-3 px-4 font-medium">
                            Counter / Cutoff Verification
                          </th>
                          <th className="py-3 px-4 font-medium">Notes</th>
                          <th className="py-3 px-4 font-medium text-right">Token Delta</th>
                          <th className="py-3 px-4 font-medium text-right">Balance After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E2026]">
                        {filteredLogs.map((log) => {
                          const isSkip = log.entryKind === 'skip';
                          return (
                            <tr
                              key={log.id}
                              className="hover:bg-[#16191F]/70 transition-colors"
                            >
                              <td className="py-3 px-4 font-mono tabular-nums text-[#9CA3AF] whitespace-nowrap">
                                {log.loggedAtIso.slice(0, 16).replace('T', ' ')}
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums text-[#D1D5DB] whitespace-nowrap">
                                {log.targetMealDate}
                              </td>
                              <td className="py-3 px-4 font-medium text-[#F4F3EF] capitalize whitespace-nowrap">
                                {log.mealType}
                              </td>
                              <td className="py-3 px-4 text-[#D1D5DB] whitespace-nowrap">
                                {isSkip
                                  ? `Meal Skip · ⌊${log.baseCost}T ÷ 2⌋ Refund`
                                  : log.isGuestMeal
                                  ? `Guest Meal · 2× (${log.baseCost}T × 2)`
                                  : `Resident · 1× (${log.baseCost}T)`}
                              </td>
                              <td className="py-3 px-4 text-[#9CA3AF]">
                                {log.diningCounter}
                              </td>
                              <td className="py-3 px-4 text-[#9CA3AF]">
                                {log.notes || 'Standard serving'}
                              </td>
                              <td
                                className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                  isSkip ? 'text-[#22C55E]' : 'text-[#E05A33]'
                                }`}
                              >
                                {isSkip ? `+${log.refundTokens}T` : `-${log.tokenCost}T`}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F4F3EF] whitespace-nowrap">
                                {log.balanceAfter}T / {account.monthlyAllowance}T
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recharts Line Chart beneath the Monthly Billing Statement section */}
              <MonthlyBalanceTrendChart account={account} logs={mealLogs} />
            </section>

            {/* Section 03: Stage 1 Core Database Schema & Security Architecture */}
            <SchemaArchitecturePanel
              account={account}
              latestLog={mealLogs[0] || null}
              authMode={firebaseUser ? 'firebase' : 'sandbox'}
            />
          </>
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-[#23262D] mt-16 py-8 px-6 text-xs text-[#9CA3AF]">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#F4F3EF] font-display">Mess Tokens</span>
            <span aria-hidden="true">·</span>
            <span>Hostel Meal Tracker, Admin Forecast &amp; Dietary Credit Ledger</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
            <span>Base Allowance: 60T</span>
            <span aria-hidden="true">·</span>
            <span>Skip Cutoff: 8 PM Prev Day (⌊½⌋ Refund)</span>
            <span aria-hidden="true">·</span>
            <span>Rollover Cap: 10T</span>
            <span aria-hidden="true">·</span>
            <span>Admin Forecast Limit: 120 Meals</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
