import React from 'react';
import { MONTHLY_STARTING_TOKENS } from '../utils/tokenRules';

interface PunchGridVisualizerProps {
  monthlyAllowance: number;
  rolloverTokens: number;
  tokenBalance: number;
  tokensUsed: number;
  tokensRefunded: number;
  pendingCost: number;
  wouldOverdraft: boolean;
}

export const PunchGridVisualizer: React.FC<PunchGridVisualizerProps> = ({
  monthlyAllowance,
  rolloverTokens,
  tokenBalance,
  tokensUsed,
  tokensRefunded,
  pendingCost,
  wouldOverdraft,
}) => {
  const totalSlots = Math.max(monthlyAllowance, MONTHLY_STARTING_TOKENS);
  const netUsed = Math.max(0, totalSlots - tokenBalance);

  const cells = Array.from({ length: totalSlots }, (_, idx) => {
    const tokenNumber = idx + 1;
    const isRolloverSlot = tokenNumber > MONTHLY_STARTING_TOKENS;
    const isSpent = tokenNumber <= netUsed;
    const isPreview =
      !isSpent &&
      !wouldOverdraft &&
      pendingCost > 0 &&
      tokenNumber > netUsed &&
      tokenNumber <= netUsed + pendingCost;
    const isOverdraftShortfall =
      !isSpent && wouldOverdraft && tokenNumber > netUsed && tokenNumber <= totalSlots;

    return {
      tokenNumber,
      isRolloverSlot,
      isSpent,
      isPreview,
      isOverdraftShortfall,
    };
  });

  return (
    <div
      className="border border-[#23262D] bg-[#111317] p-6"
      data-testid="token-punch-matrix"
      aria-label={`Monthly token card visualization: ${tokenBalance} tokens available out of ${totalSlots}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-5 border-b border-[#23262D]">
        <div>
          <p className="text-xs text-[#9CA3AF] tracking-wide">
            Monthly Dietary Credit Card · {MONTHLY_STARTING_TOKENS} Base
            {rolloverTokens > 0 ? ` + ${rolloverTokens} Rollover` : ''} Matrix
          </p>
          <h3 className="text-xl font-semibold text-[#F4F3EF] mt-1">
            Physical Token Punch Sheet ({totalSlots} Slots)
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#9CA3AF] tabular-nums">
          <span>Redeemed: {tokensUsed}T</span>
          <span aria-hidden="true">·</span>
          <span>Skip Refunds: +{tokensRefunded}T</span>
          <span aria-hidden="true">·</span>
          <span className="text-[#F4F3EF] font-medium">
            Available: {tokenBalance}T
          </span>
        </div>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 my-6">
        {cells.map((cell) => {
          let cellClasses =
            'h-10 flex flex-col items-center justify-center border text-xs font-mono tabular-nums transition-transform duration-150 select-none ';

          if (cell.isSpent) {
            cellClasses +=
              'border-[#1E2026] bg-[#0B0C0E] text-[#4B5563] line-through opacity-55';
          } else if (cell.isOverdraftShortfall) {
            cellClasses +=
              'border-[#DC2626] bg-[#DC2626]/15 text-[#FCA5A5] font-semibold scale-[1.02]';
          } else if (cell.isPreview) {
            cellClasses +=
              'border-[#E05A33] bg-[#E05A33]/20 text-[#F4F3EF] font-semibold -translate-y-0.5';
          } else if (cell.isRolloverSlot) {
            cellClasses +=
              'border-[#16A34A]/60 bg-[#16A34A]/10 text-[#BBF7D0] hover:border-[#22C55E]';
          } else {
            cellClasses +=
              'border-[#2A2E37] bg-[#16191F] text-[#D1D5DB] hover:border-[#4B5563]';
          }

          return (
            <div
              key={cell.tokenNumber}
              className={cellClasses}
              title={
                cell.isSpent
                  ? `Token #${cell.tokenNumber}: Redeemed`
                  : cell.isRolloverSlot
                  ? `Token #${cell.tokenNumber}: Rolled over from previous month`
                  : `Token #${cell.tokenNumber}: Available credit`
              }
            >
              <span>{String(cell.tokenNumber).padStart(2, '0')}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#23262D] text-xs text-[#9CA3AF]">
        <div className="flex flex-wrap items-center gap-5">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border border-[#2A2E37] bg-[#16191F] inline-block" />
            <span>Available ({tokenBalance})</span>
          </span>
          {rolloverTokens > 0 && (
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 border border-[#16A34A]/60 bg-[#16A34A]/15 inline-block" />
              <span>Carryover Bonus ({rolloverTokens}/10 Cap)</span>
            </span>
          )}
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border border-[#E05A33] bg-[#E05A33]/25 inline-block" />
            <span>Pending Selection ({pendingCost})</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border border-[#1E2026] bg-[#0B0C0E] inline-block" />
            <span>Redeemed ({tokensUsed})</span>
          </span>
        </div>
        <span className="font-mono tabular-nums text-[#D1D5DB]">
          Rollover Cap: 10T · Skip Refund: ⌊Base ÷ 2⌋
        </span>
      </div>
    </div>
  );
};
