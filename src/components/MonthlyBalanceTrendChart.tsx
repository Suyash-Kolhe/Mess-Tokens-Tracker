import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildMonthlyBalanceTrendSeries,
  MealLogRecord,
  StudentAccountData,
} from '../utils/tokenRules';

interface MonthlyBalanceTrendChartProps {
  account: StudentAccountData;
  logs: MealLogRecord[];
}

export const MonthlyBalanceTrendChart: React.FC<MonthlyBalanceTrendChartProps> = ({
  account,
  logs,
}) => {
  const trendData = useMemo(
    () => buildMonthlyBalanceTrendSeries(account, logs),
    [account, logs]
  );

  return (
    <div
      data-testid="monthly-balance-trend-chart"
      className="mt-6 border border-[#23262D] bg-[#111317] p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-5 border-b border-[#23262D]">
        <div>
          <p className="text-xs text-[#9CA3AF]">
            Monthly Token Balance Trajectory · Cycle {account.currentMonth}
          </p>
          <h3 className="text-lg font-semibold text-[#F4F3EF] mt-1">
            Token Balance Trends Over Current Month
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-[#9CA3AF]">
          <span>Opening Credit: {account.monthlyAllowance}T</span>
          <span aria-hidden="true">·</span>
          <span>Current Balance: {account.tokenBalance}T</span>
          <span aria-hidden="true">·</span>
          <span className="text-[#E05A33]">Floor Limit: 0T</span>
        </div>
      </div>

      <div className="mt-6 h-[280px] w-full" style={{ minWidth: 280, minHeight: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={trendData}
            margin={{ top: 12, right: 20, left: 0, bottom: 8 }}
          >
            <CartesianGrid stroke="#1E2026" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              stroke="#6B7280"
              tick={{ fill: '#9CA3AF', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              tickLine={{ stroke: '#23262D' }}
              axisLine={{ stroke: '#23262D' }}
            />
            <YAxis
              domain={[0, Math.max(70, account.monthlyAllowance + 4)]}
              stroke="#6B7280"
              tick={{ fill: '#9CA3AF', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              tickLine={{ stroke: '#23262D' }}
              axisLine={{ stroke: '#23262D' }}
              unit="T"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0B0C0E',
                borderColor: '#2A2E37',
                color: '#F4F3EF',
                fontSize: '12px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
              labelStyle={{ color: '#9CA3AF', marginBottom: '4px' }}
              formatter={(value: unknown) => [`${value} Tokens`, 'Token Balance']}
            />
            <ReferenceLine
              y={account.monthlyAllowance}
              stroke="#4B5563"
              strokeDasharray="4 4"
              label={{
                value: `Opening (${account.monthlyAllowance}T)`,
                position: 'insideTopRight',
                fill: '#9CA3AF',
                fontSize: 11,
              }}
            />
            <ReferenceLine
              y={0}
              stroke="#DC2626"
              strokeDasharray="2 2"
              label={{
                value: 'Zero-Balance Floor (0T)',
                position: 'insideBottomRight',
                fill: '#FCA5A5',
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="tokenBalance"
              name="Token Balance"
              stroke="#E05A33"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#E05A33', stroke: '#0B0C0E', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: '#F4F3EF', stroke: '#E05A33', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 mt-2 border-t border-[#23262D] text-xs text-[#9CA3AF]">
        <span>
          Tracks every meal deduction (-1T/-2T/-4T) and pre-8PM skip refund (+1T) across{' '}
          {account.currentMonth}.
        </span>
        <span className="font-mono tabular-nums text-[#D1D5DB]">
          Data Points: {trendData.length} · Net Change:{' '}
          {account.tokenBalance - account.monthlyAllowance >= 0
            ? `+${account.tokenBalance - account.monthlyAllowance}T`
            : `${account.tokenBalance - account.monthlyAllowance}T`}
        </span>
      </div>
    </div>
  );
};
