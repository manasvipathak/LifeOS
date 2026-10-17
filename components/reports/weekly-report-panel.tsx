'use client';

import { useState } from 'react';

type DailyCount = { date: string; count: number };
type WeeklyReport = {
  period: { startDate: string; endDate: string; complete: boolean; timezone: 'UTC' };
  generatedAt: string;
  tasks: {
    completedInPeriod: number;
    openNow: number;
    overdueNow: number;
    priorityCountsNow: Record<'low' | 'medium' | 'high', number>;
    completionsByDay: DailyCount[];
  };
  journal: { entriesInPeriod: number; entriesByDay: DailyCount[] };
  mood: null | {
    entriesInPeriod: number;
    entriesPreviousPeriod: number;
    countsByMood: Record<string, number>;
    previousCountsByMood: Record<string, number>;
  };
  interpretation: {
    source: 'ai_guided' | 'rules_fallback';
    fallbackReason?: string;
    wins: string[];
    bottlenecks: string[];
    suggestions: string[];
  };
};

function currentMonday(): string {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  utcToday.setUTCDate(utcToday.getUTCDate() - ((utcToday.getUTCDay() + 6) % 7));
  return utcToday.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const moodLabels: Record<string, string> = {
  very_happy: 'Very happy',
  happy: 'Happy',
  neutral: 'Neutral',
  sad: 'Sad',
  stressed: 'Stressed',
};

export function WeeklyReportPanel() {
  const [weekStart, setWeekStart] = useState(currentMonday);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadReport() {
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const response = await fetch('/api/ai/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message ?? 'Unable to build the weekly report.');
      if (!result?.report?.tasks || !result?.report?.journal || !result?.report?.interpretation) {
        throw new Error('The weekly report response was invalid.');
      }
      setReport(result.report as WeeklyReport);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to build the weekly report.');
    } finally {
      setLoading(false);
    }
  }

  const hasNoActivity = report &&
    report.tasks.completedInPeriod === 0 &&
    report.tasks.openNow === 0 &&
    report.journal.entriesInPeriod === 0 &&
    report.mood === null &&
    Object.values(report.tasks.priorityCountsNow).every((count) => count === 0);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Weekly AI life report</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Review task progress, journal activity, and recorded mood check-ins. Database statistics are kept separate from AI-guided suggestions.
          </p>
        </div>
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void loadReport();
          }}
        >
          <label className="block text-sm font-medium text-slate-700">
            Week starting Monday (UTC)
            <input
              aria-label="Week starting Monday"
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              required
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !weekStart}
            className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Building report…' : 'Generate report'}
          </button>
        </form>
        {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {loading ? <p role="status" className="mt-4 text-sm text-slate-600">Loading your private statistics and preparing supported suggestions…</p> : null}
      </section>

      {report ? (
        <>
          <section className="rounded-3xl border border-brand-100 bg-brand-50 p-5 sm:p-6" aria-labelledby="report-period-heading">
            <h2 id="report-period-heading" className="font-semibold text-slate-900">Reporting period</h2>
            <p className="mt-1 text-sm text-slate-700">
              {formatDate(report.period.startDate)} – {formatDate(report.period.endDate)}
              {!report.period.complete ? ' (week to date)' : ''}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Task status, overdue tasks, and priority counts are a current snapshot as of {new Date(report.generatedAt).toLocaleString()}.
            </p>
          </section>

          {hasNoActivity ? (
            <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="font-semibold text-slate-900">No activity to summarize yet</h2>
              <p className="mt-2 text-sm text-slate-600">Add tasks, journal entries, or mood check-ins to see a more detailed weekly report.</p>
            </section>
          ) : null}

          <section aria-labelledby="report-facts-heading">
            <h2 id="report-facts-heading" className="mb-3 text-lg font-semibold text-slate-900">Database statistics</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Tasks completed in period" value={report.tasks.completedInPeriod} />
              <StatCard label="Open tasks now" value={report.tasks.openNow} />
              <StatCard label="Overdue tasks now" value={report.tasks.overdueNow} />
              <StatCard label="Journal entries in period" value={report.journal.entriesInPeriod} />
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <DailyCounts heading="Task completions by day" entries={report.tasks.completionsByDay} />
            <DailyCounts heading="Journal activity by day" entries={report.journal.entriesByDay} />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="font-semibold text-slate-900">Current task priority distribution</h2>
            <p className="mt-1 text-sm text-slate-500">Counts include all saved tasks, including completed tasks.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(['high', 'medium', 'low'] as const).map((priority) => (
                <div key={priority} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm capitalize text-slate-600">{priority} priority</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{report.tasks.priorityCountsNow[priority]}</p>
                </div>
              ))}
            </div>
          </section>

          {report.mood ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="font-semibold text-slate-900">Recorded mood check-ins</h2>
              <p className="mt-1 text-sm text-slate-600">
                {report.mood.entriesInPeriod} check-in(s) this period, compared with {report.mood.entriesPreviousPeriod} in the previous seven-day period.
                These are counts of your selected check-ins, not health or psychological conclusions.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-80 text-left text-sm">
                  <thead><tr className="border-b text-slate-500"><th className="py-2 pr-4 font-medium">Selected mood</th><th className="py-2 pr-4 font-medium">This period</th><th className="py-2 font-medium">Previous period</th></tr></thead>
                  <tbody>
                    {[...new Set([...Object.keys(report.mood.countsByMood), ...Object.keys(report.mood.previousCountsByMood)])].map((mood) => (
                      <tr key={mood} className="border-b last:border-0">
                        <th scope="row" className="py-2 pr-4 font-medium text-slate-800">{moodLabels[mood] ?? 'Other'}</th>
                        <td className="py-2 pr-4 tabular-nums">{report.mood?.countsByMood[mood] ?? 0}</td>
                        <td className="py-2 tabular-nums">{report.mood?.previousCountsByMood[mood] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              No mood check-ins were recorded during this period, so no mood trend is shown.
            </p>
          )}

          <section className="rounded-3xl border border-indigo-100 bg-white p-5 sm:p-6" aria-labelledby="interpretation-heading">
            <h2 id="interpretation-heading" className="font-semibold text-slate-900">Wins, bottlenecks, and next steps</h2>
            <p className="mt-1 text-sm text-slate-600">
              {report.interpretation.source === 'ai_guided'
                ? 'AI selected from a limited set of suggestions supported by task counts. The displayed wording is grounded in those counts.'
                : 'Rules-based suggestions are shown because AI guidance was unavailable or no activity required interpretation.'}
            </p>
            {report.interpretation.fallbackReason ? <p className="mt-1 text-xs text-slate-500">AI fallback: {report.interpretation.fallbackReason.replaceAll('_', ' ')}</p> : null}
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <InsightList title="Wins" values={report.interpretation.wins} empty="No completed-task wins recorded for this period." />
              <InsightList title="Bottlenecks" values={report.interpretation.bottlenecks} empty="No current task bottleneck was identified from the available counts." />
              <InsightList title="Suggestions" values={report.interpretation.suggestions} empty="No additional suggestions." />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function DailyCounts({ heading, entries }: { heading: string; entries: DailyCount[] }) {
  const maximum = Math.max(1, ...entries.map(({ count }) => count));
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="font-semibold text-slate-900">{heading}</h2>
      <ul className="mt-4 space-y-3">
        {entries.map(({ date, count }) => (
          <li key={date} className="grid grid-cols-[5rem_1fr_2rem] items-center gap-3 text-sm">
            <span className="text-slate-600">{new Date(`${date}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}</span>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${heading}: ${date}`} aria-valuenow={count} aria-valuemin={0} aria-valuemax={maximum}>
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${(count / maximum) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums text-slate-700">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsightList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {values.length ? (
        <ul className="mt-2 space-y-2 text-sm text-slate-700">{values.map((value) => <li key={value} className="rounded-xl bg-slate-50 p-3">{value}</li>)}</ul>
      ) : <p className="mt-2 text-sm text-slate-500">{empty}</p>}
    </div>
  );
}
