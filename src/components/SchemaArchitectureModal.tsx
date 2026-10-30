import React from 'react';
import { MealLogRecord, StudentAccountData } from '../utils/tokenRules';

interface SchemaArchitecturePanelProps {
  account: StudentAccountData;
  latestLog: MealLogRecord | null;
  authMode: 'firebase' | 'sandbox';
}

export const SchemaArchitecturePanel: React.FC<SchemaArchitecturePanelProps> = ({
  account,
  latestLog,
  authMode,
}) => {
  return (
    <section
      id="schema-section"
      aria-labelledby="schema-heading"
      className="border-t border-[#23262D] pt-14 mt-14"
    >
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-xs text-[#9CA3AF] tracking-wide">
            03. Core Database Schema, Pre-8PM Skip Refunds &amp; Rollover Invariants
          </p>
          <h2
            id="schema-heading"
            className="text-2xl sm:text-3xl font-semibold text-[#F4F3EF] mt-1 tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            Firestore Entity Blueprint &amp; Atomic Ledger Invariants
          </h2>
        </div>
        <p className="text-sm text-[#9CA3AF] max-w-xl">
          Every meal redemption, pre-8PM meal skip refund, and monthly rollover executes an
          atomic mutation across{' '}
          <code className="font-mono text-[#F4F3EF]">/students/&#123;studentUid&#125;</code> and{' '}
          <code className="font-mono text-[#F4F3EF]">
            /students/&#123;studentUid&#125;/mealLogs/&#123;logId&#125;
          </code>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collection 1: StudentAccount */}
        <div className="border border-[#23262D] bg-[#111317] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#23262D]">
              <h3 className="text-base font-semibold text-[#F4F3EF]">
                Entity 01 · StudentAccount
              </h3>
              <span className="font-mono text-xs text-[#9CA3AF]">
                /students/&#123;studentUid&#125;
              </span>
            </div>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#D1D5DB]">monthlyAllowance</dt>
                <dd className="font-mono text-[#F4F3EF] text-right tabular-nums">
                  60 + rolloverTokens (max 70)
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#22C55E]">rolloverTokens</dt>
                <dd className="font-mono text-[#F4F3EF] text-right tabular-nums">
                  int ∈ [0, 10] (capped at 10)
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#E05A33]">tokenBalance</dt>
                <dd className="font-mono text-[#F4F3EF] text-right tabular-nums">
                  int ≥ 0 (never negative)
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#D1D5DB]">tokensUsed</dt>
                <dd className="font-mono text-[#9CA3AF] text-right tabular-nums">
                  int · redeemed for meals
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#D1D5DB]">tokensRefunded</dt>
                <dd className="font-mono text-[#9CA3AF] text-right tabular-nums">
                  int · ∑ floor(baseCost / 2)
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#D1D5DB]">Conservation Rule</dt>
                <dd className="font-mono text-[#9CA3AF] text-right tabular-nums">
                  allowance - used + refunded
                </dd>
              </div>
            </dl>
          </div>
          <div className="mt-6 pt-4 border-t border-[#23262D] text-xs text-[#9CA3AF]">
            Auth Mode:{' '}
            <span className="text-[#F4F3EF] font-medium">
              {authMode === 'firebase'
                ? 'Live Firebase Auth + Firestore Sync'
                : 'Interactive Resident Session (Google Auth Ready)'}
            </span>
          </div>
        </div>

        {/* Collection 2: MealLog Subcollection */}
        <div className="border border-[#23262D] bg-[#111317] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#23262D]">
              <h3 className="text-base font-semibold text-[#F4F3EF]">Entity 02 · MealLog</h3>
              <span className="font-mono text-xs text-[#9CA3AF]">
                /students/&#123;uid&#125;/mealLogs/&#123;id&#125;
              </span>
            </div>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#D1D5DB]">entryKind</dt>
                <dd className="font-mono text-[#F4F3EF] text-right">
                  &apos;meal&apos; | &apos;skip&apos;
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#D1D5DB]">baseCost</dt>
                <dd className="font-mono text-[#F4F3EF] text-right tabular-nums">
                  Breakfast=1 · Lunch=2 · Dinner=2
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#22C55E]">refundTokens (skip)</dt>
                <dd className="font-mono text-[#F4F3EF] text-right tabular-nums">
                  ⌊baseCost ÷ 2⌋ (B=0T, L/D=+1T)
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#E05A33]">Skip Cutoff Rule</dt>
                <dd className="font-mono text-[#F4F3EF] text-right">
                  &lt; 20:00 (8 PM) Previous Day
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#D1D5DB]">targetMealDate</dt>
                <dd className="font-mono text-[#9CA3AF] text-right tabular-nums">
                  YYYY-MM-DD
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-[#D1D5DB]">Immutability</dt>
                <dd className="font-mono text-[#9CA3AF] text-right">
                  Append-only (update/delete: false)
                </dd>
              </div>
            </dl>
          </div>
          <div className="mt-6 pt-4 border-t border-[#23262D] text-xs text-[#9CA3AF]">
            Relational Gate:{' '}
            <span className="font-mono text-[#F4F3EF]">
              getAfter(student).tokenBalance == balanceAfter
            </span>
          </div>
        </div>

        {/* Live Document State Inspector */}
        <div className="border border-[#23262D] bg-[#111317] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#23262D]">
              <h3 className="text-base font-semibold text-[#F4F3EF]">
                Live Document Snapshot
              </h3>
              <span className="font-mono text-xs text-[#9CA3AF] tabular-nums">
                Balance: {account.tokenBalance}T / {account.monthlyAllowance}T
              </span>
            </div>
            <pre className="mt-4 text-[11px] leading-relaxed font-mono text-[#D1D5DB] overflow-x-auto bg-[#0B0C0E] p-3.5 border border-[#1E2026] tabular-nums">
              {JSON.stringify(
                {
                  student: {
                    uid: account.uid,
                    currentMonth: account.currentMonth,
                    monthlyAllowance: account.monthlyAllowance,
                    rolloverTokens: account.rolloverTokens,
                    tokenBalance: account.tokenBalance,
                    tokensUsed: account.tokensUsed,
                    tokensRefunded: account.tokensRefunded,
                    skipsLoggedCount: account.skipsLoggedCount,
                  },
                  latestEntry: latestLog
                    ? {
                        entryKind: latestLog.entryKind,
                        mealType: latestLog.mealType,
                        targetMealDate: latestLog.targetMealDate,
                        tokenCost: latestLog.tokenCost,
                        refundTokens: latestLog.refundTokens,
                        balanceAfter: latestLog.balanceAfter,
                      }
                    : null,
                },
                null,
                2
              )}
            </pre>
          </div>
          <div className="mt-4 text-xs text-[#9CA3AF]">
            Conservation Check:{' '}
            <span className="font-mono text-[#F4F3EF] tabular-nums">
              {account.monthlyAllowance} allowance - {account.tokensUsed} used +{' '}
              {account.tokensRefunded} refunded = {account.tokenBalance}T
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
