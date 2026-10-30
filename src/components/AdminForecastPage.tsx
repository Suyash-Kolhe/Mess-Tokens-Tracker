import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import {
  calculateTomorrowForecast,
  FORECAST_WARNING_THRESHOLD,
  MealLogRecord,
  StudentAccountData,
} from '../utils/tokenRules';

interface AdminForecastPageProps {
  forecastDate: string;
  studentAccount: StudentAccountData;
  studentLogs: MealLogRecord[];
}

export const AdminForecastPage: React.FC<AdminForecastPageProps> = ({
  forecastDate,
  studentAccount,
  studentLogs,
}) => {
  // Count how many skips and guest meals the current active student logged for forecastDate
  const studentSkipsForTomorrow = useMemo(
    () =>
      studentLogs.filter(
        (l) => l.entryKind === 'skip' && l.targetMealDate === forecastDate
      ).length,
    [studentLogs, forecastDate]
  );

  const studentGuestsForTomorrow = useMemo(
    () =>
      studentLogs.filter(
        (l) =>
          l.entryKind === 'meal' &&
          l.isGuestMeal &&
          l.targetMealDate === forecastDate
      ).length,
    [studentLogs, forecastDate]
  );

  // Admin adjustable hostel baseline counts
  const [enrolledStudents, setEnrolledStudents] = useState<number>(118);
  const [baseStudentsSkipped, setBaseStudentsSkipped] = useState<number>(4);
  const [baseGuestMeals, setBaseGuestMeals] = useState<number>(14);

  const totalSkipped = Math.min(
    enrolledStudents,
    baseStudentsSkipped + studentSkipsForTomorrow
  );
  const totalGuests = baseGuestMeals + studentGuestsForTomorrow;

  const forecast = useMemo(
    () =>
      calculateTomorrowForecast({
        forecastDate,
        enrolledStudents,
        studentsSkipped: totalSkipped,
        guestMealsCount: totalGuests,
      }),
    [forecastDate, enrolledStudents, totalSkipped, totalGuests]
  );

  // Session breakdown across Breakfast, Lunch, Dinner
  const sessionForecasts = useMemo(() => {
    const bSkips = Math.max(0, totalSkipped + 2);
    const lSkips = totalSkipped;
    const dSkips = Math.max(0, totalSkipped - 1);

    return [
      {
        session: 'Breakfast',
        hours: '07:00 – 09:30',
        enrolled: enrolledStudents,
        skipped: bSkips,
        attending: Math.max(0, enrolledStudents - bSkips),
        guests: Math.max(0, Math.floor(totalGuests * 0.5)),
        total: Math.max(0, enrolledStudents - bSkips) + Math.max(0, Math.floor(totalGuests * 0.5)),
      },
      {
        session: 'Lunch (Peak)',
        hours: '12:15 – 14:30',
        enrolled: enrolledStudents,
        skipped: lSkips,
        attending: forecast.studentsAttending,
        guests: totalGuests,
        total: forecast.totalForecastMeals,
      },
      {
        session: 'Dinner',
        hours: '19:30 – 21:45',
        enrolled: enrolledStudents,
        skipped: dSkips,
        attending: Math.max(0, enrolledStudents - dSkips),
        guests: Math.max(0, totalGuests - 2),
        total: Math.max(0, enrolledStudents - dSkips) + Math.max(0, totalGuests - 2),
      },
    ];
  }, [enrolledStudents, totalSkipped, totalGuests, forecast]);

  return (
    <section
      id="admin-forecast-page"
      data-testid="admin-forecast-page"
      aria-labelledby="admin-forecast-heading"
      className="space-y-8"
    >
      {/* Header & Proposition */}
      <div className="border-b border-[#23262D] pb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF] mb-3">
            <span>Hostel Mess Administration Console</span>
            <span aria-hidden="true">·</span>
            <span>Tomorrow&apos;s Date: {forecastDate}</span>
            <span aria-hidden="true">·</span>
            <span>Kitchen Threshold: {FORECAST_WARNING_THRESHOLD} Meals</span>
          </div>
          <h1
            id="admin-forecast-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[#F4F3EF]"
            style={{ textWrap: 'balance' }}
          >
            Tomorrow&apos;s Mess Meal Forecast &amp; Capacity Monitor
          </h1>
          <p className="mt-3 text-sm text-[#9CA3AF] max-w-2xl leading-relaxed">
            Calculates tomorrow&apos;s catering load by combining{' '}
            <strong className="text-[#F4F3EF] font-medium">
              students who haven&apos;t skipped
            </strong>{' '}
            (enrolled residents minus verified pre-8PM skips) plus{' '}
            <strong className="text-[#F4F3EF] font-medium">registered guest meals</strong>.
            Automatically flags an over-capacity warning whenever the forecast exceeds{' '}
            <strong className="text-[#F4F3EF] font-medium">120 meals</strong>.
          </p>
        </div>

        {/* Quick Scenario Presets for Testing >120 Warning vs <=120 Nominal */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setEnrolledStudents(118);
              setBaseStudentsSkipped(4);
              setBaseGuestMeals(14);
            }}
            className="px-3.5 py-2 text-xs font-semibold bg-[#16191F] hover:bg-[#1E222B] border border-[#2A2E37] text-[#F4F3EF] transition-colors cursor-pointer whitespace-nowrap"
          >
            Simulate High Load (&gt;120 Meals Warning)
          </button>
          <button
            type="button"
            onClick={() => {
              setEnrolledStudents(115);
              setBaseStudentsSkipped(12);
              setBaseGuestMeals(8);
            }}
            className="px-3.5 py-2 text-xs font-semibold bg-[#16191F] hover:bg-[#1E222B] border border-[#2A2E37] text-[#D1D5DB] transition-colors cursor-pointer whitespace-nowrap"
          >
            Simulate Normal Load (≤120 Meals)
          </button>
        </div>
      </div>

      {/* Over-120 Meals Capacity Warning Banner */}
      {forecast.exceedsCapacityThreshold ? (
        <div
          role="alert"
          data-testid="admin-forecast-warning"
          className="p-6 border border-[#DC2626] bg-[#DC2626]/12 text-[#FCA5A5] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 text-sm font-bold text-[#FEE2E2]">
              <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0" />
              <span>
                High-Capacity Kitchen Warning: Forecast Exceeds 120 Meals (
                {forecast.totalForecastMeals} Meals Projected)
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[#FCA5A5]">
              {forecast.warningMessage} Deploy auxiliary serving counter and authorize
              additional batch preparation before 06:00 AM.
            </p>
          </div>
          <div className="font-mono tabular-nums text-right shrink-0">
            <span className="text-2xl font-bold text-[#FEE2E2]">
              +{forecast.mealsOverThreshold} Meals
            </span>
            <span className="block text-xs text-[#FCA5A5]">Above 120-meal threshold</span>
          </div>
        </div>
      ) : (
        <div
          role="status"
          data-testid="admin-forecast-nominal"
          className="p-5 border border-[#16A34A] bg-[#16A34A]/12 text-[#BBF7D0] flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5 text-xs">
            <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
            <span>
              Nominal Catering Capacity: Tomorrow&apos;s forecast of{' '}
              <strong className="font-mono tabular-nums">
                {forecast.totalForecastMeals} meals
              </strong>{' '}
              is within the 120-meal hall threshold (
              {FORECAST_WARNING_THRESHOLD - forecast.totalForecastMeals} meals buffer
              remaining).
            </span>
          </div>
          <span className="font-mono text-xs tabular-nums text-[#22C55E] shrink-0">
            ≤ 120 Limit OK
          </span>
        </div>
      )}

      {/* 4-Column Forecast Equation Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-[#23262D] bg-[#111317]">
        <div className="p-6 border-b sm:border-b-0 sm:border-r border-[#23262D]">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Enrolled Hostel Students</span>
            <ClipboardList className="w-4 h-4 text-[#6B7280]" />
          </div>
          <p
            data-testid="admin-enrolled-count"
            className="text-3xl font-bold font-mono tabular-nums text-[#F4F3EF] mt-2"
          >
            {forecast.enrolledStudents}
          </p>
          <p className="text-xs text-[#6B7280] mt-1">
            Total active residents in Block C &amp; Commons
          </p>
        </div>

        <div className="p-6 border-b lg:border-b-0 lg:border-r border-[#23262D]">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Students Who Haven&apos;t Skipped</span>
            <UserCheck className="w-4 h-4 text-[#22C55E]" />
          </div>
          <p
            data-testid="admin-students-attending"
            className="text-3xl font-bold font-mono tabular-nums text-[#F4F3EF] mt-2"
          >
            {forecast.studentsAttending}
          </p>
          <p className="text-xs text-[#9CA3AF] mt-1 font-mono tabular-nums">
            {forecast.enrolledStudents} enrolled − {forecast.studentsSkipped} pre-8PM skips
          </p>
        </div>

        <div className="p-6 border-b sm:border-b-0 sm:border-r border-[#23262D]">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Plus Registered Guests</span>
            <Users className="w-4 h-4 text-[#E05A33]" />
          </div>
          <p
            data-testid="admin-guests-count"
            className="text-3xl font-bold font-mono tabular-nums text-[#E05A33] mt-2"
          >
            +{forecast.guestMealsCount}
          </p>
          <p className="text-xs text-[#6B7280] mt-1 font-mono tabular-nums">
            2× token rate guest bookings for {forecastDate}
          </p>
        </div>

        <div className="p-6 bg-[#0B0C0E]">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Tomorrow&apos;s Total Forecast</span>
            {forecast.exceedsCapacityThreshold ? (
              <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
            )}
          </div>
          <p
            data-testid="admin-total-forecast-meals"
            className={`text-3xl font-bold font-mono tabular-nums mt-2 ${
              forecast.exceedsCapacityThreshold ? 'text-[#FCA5A5]' : 'text-[#F4F3EF]'
            }`}
          >
            {forecast.totalForecastMeals} Meals
          </p>
          <p className="text-xs text-[#9CA3AF] mt-1 font-mono tabular-nums">
            {forecast.studentsAttending} students + {forecast.guestMealsCount} guests (Limit:{' '}
            {FORECAST_WARNING_THRESHOLD})
          </p>
        </div>
      </div>

      {/* Interactive Forecast Calibration Controls & Session Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 5 cols: Admin Parameter Calibration */}
        <div className="lg:col-span-5 border border-[#23262D] bg-[#111317] p-6 space-y-5">
          <div className="pb-4 border-b border-[#23262D]">
            <p className="text-xs text-[#9CA3AF]">Admin Capacity Simulator</p>
            <h2 className="text-lg font-semibold text-[#F4F3EF] mt-1">
              Adjust Tomorrow&apos;s Attendance &amp; Guest Inputs
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="admin-enrolled-input"
                className="flex justify-between text-xs font-medium text-[#D1D5DB] mb-1.5"
              >
                <span>Total Enrolled Students</span>
                <span className="font-mono tabular-nums">{enrolledStudents}</span>
              </label>
              <input
                id="admin-enrolled-input"
                type="number"
                min={10}
                max={500}
                value={enrolledStudents}
                onChange={(e) => setEnrolledStudents(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
              />
            </div>

            <div>
              <label
                htmlFor="admin-skipped-input"
                className="flex justify-between text-xs font-medium text-[#D1D5DB] mb-1.5"
              >
                <span>
                  Students Who Logged Pre-8PM Skips (incl. {studentSkipsForTomorrow} from
                  active student)
                </span>
                <span className="font-mono tabular-nums text-[#22C55E]">
                  -{totalSkipped}
                </span>
              </label>
              <input
                id="admin-skipped-input"
                type="number"
                min={0}
                max={enrolledStudents}
                value={baseStudentsSkipped}
                onChange={(e) => setBaseStudentsSkipped(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
              />
            </div>

            <div>
              <label
                htmlFor="admin-guests-input"
                className="flex justify-between text-xs font-medium text-[#D1D5DB] mb-1.5"
              >
                <span>
                  Expected Guest Meals (incl. {studentGuestsForTomorrow} from active student)
                </span>
                <span className="font-mono tabular-nums text-[#E05A33]">
                  +{totalGuests}
                </span>
              </label>
              <input
                id="admin-guests-input"
                type="number"
                min={0}
                max={200}
                value={baseGuestMeals}
                onChange={(e) => setBaseGuestMeals(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B0C0E] border border-[#2A2E37] text-[#F4F3EF] focus:outline-none focus:border-[#E05A33]"
              />
            </div>
          </div>

          <div className="p-4 bg-[#0B0C0E] border border-[#23262D] text-xs font-mono tabular-nums space-y-2">
            <div className="flex justify-between text-[#9CA3AF]">
              <span>Students Not Skipping:</span>
              <span className="text-[#F4F3EF]">{forecast.studentsAttending}</span>
            </div>
            <div className="flex justify-between text-[#9CA3AF]">
              <span>Plus Guest Meals:</span>
              <span className="text-[#E05A33]">+{forecast.guestMealsCount}</span>
            </div>
            <div className="pt-2 border-t border-[#1E2026] flex justify-between font-bold">
              <span className="text-[#D1D5DB]">Projected Tomorrow Total:</span>
              <span
                className={
                  forecast.exceedsCapacityThreshold ? 'text-[#FCA5A5]' : 'text-[#22C55E]'
                }
              >
                {forecast.totalForecastMeals} Meals{' '}
                {forecast.exceedsCapacityThreshold ? '(>120 WARNING)' : '(≤120 OK)'}
              </span>
            </div>
          </div>
        </div>

        {/* Right 7 cols: Session Breakdown Table & Resident Skip Status */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-[#23262D] bg-[#111317] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#23262D]">
              <div>
                <h2 className="text-base font-semibold text-[#F4F3EF]">
                  Tomorrow&apos;s Session-by-Session Catering Forecast ({forecastDate})
                </h2>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  Breakdown of students who haven&apos;t skipped + guests per meal service
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                Warning Threshold: &gt;120 Meals
              </span>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#23262D] text-[#9CA3AF]">
                    <th className="py-2.5 pr-4 font-medium">Session</th>
                    <th className="py-2.5 px-4 font-medium text-right">Enrolled</th>
                    <th className="py-2.5 px-4 font-medium text-right">Pre-8PM Skips</th>
                    <th className="py-2.5 px-4 font-medium text-right">
                      Students Attending
                    </th>
                    <th className="py-2.5 px-4 font-medium text-right">Guests</th>
                    <th className="py-2.5 pl-4 font-medium text-right">Forecast Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2026] font-mono tabular-nums">
                  {sessionForecasts.map((row) => {
                    const isOver = row.total > FORECAST_WARNING_THRESHOLD;
                    return (
                      <tr key={row.session}>
                        <td className="py-3 pr-4 font-sans font-medium text-[#F4F3EF]">
                          {row.session}
                          <span className="block text-[11px] font-mono text-[#6B7280]">
                            {row.hours}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-[#9CA3AF]">
                          {row.enrolled}
                        </td>
                        <td className="py-3 px-4 text-right text-[#22C55E]">
                          -{row.skipped}
                        </td>
                        <td className="py-3 px-4 text-right text-[#F4F3EF] font-semibold">
                          {row.attending}
                        </td>
                        <td className="py-3 px-4 text-right text-[#E05A33]">
                          +{row.guests}
                        </td>
                        <td
                          className={`py-3 pl-4 text-right font-bold ${
                            isOver ? 'text-[#FCA5A5]' : 'text-[#F4F3EF]'
                          }`}
                        >
                          {row.total} meals {isOver ? '⚠' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Student Live Status in Tomorrow's Roster */}
          <div className="border border-[#23262D] bg-[#111317] p-6">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#23262D]">
              <h3 className="text-sm font-semibold text-[#F4F3EF]">
                Live Student Roster Sync ({studentAccount.fullName} ·{' '}
                {studentAccount.studentId})
              </h3>
              <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                Room {studentAccount.roomNumber}
              </span>
            </div>
            <p className="mt-3 text-xs text-[#9CA3AF] leading-relaxed">
              {studentSkipsForTomorrow > 0
                ? `${studentAccount.fullName} has logged ${studentSkipsForTomorrow} verified pre-8PM meal ${
                    studentSkipsForTomorrow === 1 ? 'skip' : 'skips'
                  } for ${forecastDate}, automatically reducing tomorrow's attending student count.`
                : `${studentAccount.fullName} has not skipped tomorrow's meals (${forecastDate}) and is counted among the ${forecast.studentsAttending} attending students.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
