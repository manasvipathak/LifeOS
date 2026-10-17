'use client';

import { useEffect, useState } from 'react';

type PlannerTask = {
  taskId: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress';
  dueDate: string | null;
};
type ScheduleItem =
  | { kind: 'task'; taskId: string; title: string; priority: string; dueDate: string | null; startTime: string; endTime: string; durationMinutes: number; durationAssumed: boolean }
  | { kind: 'break'; startTime: string; endTime: string; durationMinutes: number };
type DailyPlan = {
  planDate: string;
  timezone: string;
  availableMinutes: number;
  scheduledWorkMinutes: number;
  scheduledBreakMinutes: number;
  unusedMinutes: number;
  overdueCount: number;
  dueTodayCount: number;
  deadlineConflicts: Array<{ taskId: string; title: string; dueDate: string; reason: 'overdue' | 'due_today_not_scheduled' }>;
  taskLimitHit: boolean;
  schedule: ScheduleItem[];
  notScheduled: Array<{ taskId: string; title: string; priority: string; dueDate: string | null; durationMinutes: number; durationAssumed: boolean }>;
};
type Interpretation = { source: 'ai_guided' | 'rules_fallback' | 'disabled' | 'not_needed'; fallbackReason?: string; suggestions: string[] };

export function DailyPlannerPanel() {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [timezone, setTimezone] = useState('UTC');
  const [planDate, setPlanDate] = useState('');
  const [durations, setDurations] = useState<Record<string, string>>({});
  const [startTime, setStartTime] = useState('');
  const [availableMinutes, setAvailableMinutes] = useState('');
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [includeAI, setIncludeAI] = useState(true);
  const [taskLimitHit, setTaskLimitHit] = useState(false);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadTasks() {
      try {
        const response = await fetch('/api/ai/daily-plan');
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error?.message ?? 'Unable to load tasks.');
        if (!Array.isArray(result?.tasks) || typeof result?.today !== 'string') throw new Error('The planner task list response was invalid.');
        if (!active) return;
        setTasks(result.tasks as PlannerTask[]);
        setTimezone(typeof result.timezone === 'string' ? result.timezone : 'UTC');
        setPlanDate(result.today);
        setTaskLimitHit(result.taskLimitHit === true);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load tasks.');
      } finally {
        if (active) setLoadingTasks(false);
      }
    }
    void loadTasks();
    return () => { active = false; };
  }, []);

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanning(true);
    setError('');
    setPlan(null);
    setInterpretation(null);
    try {
      const taskDurations = Object.entries(durations)
        .filter(([, value]) => value.trim() !== '')
        .map(([taskId, value]) => ({ taskId, minutes: Number(value) }));
      const response = await fetch('/api/ai/daily-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planDate, startTime, availableMinutes: Number(availableMinutes), breakMinutes, taskDurations, includeAI }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message ?? 'Unable to create your plan.');
      if (!result?.plan || !Array.isArray(result.plan.schedule) || !result?.interpretation) throw new Error('The daily-plan response was invalid.');
      setPlan(result.plan as DailyPlan);
      setInterpretation(result.interpretation as Interpretation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create your plan.');
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-900">AI-assisted daily planner</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          A deterministic schedule orders your open tasks by deadline and priority, then fits only work that fits your time window. Optional AI guidance uses counts only.
        </p>
        <p className="mt-2 text-sm font-medium text-amber-800">
          This is a review-only proposal. No task, deadline, or calendar event is changed or saved.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Enter your available start time and total window; these are not read from a calendar. Blank task durations are assumed to be 30 minutes.
        </p>

        {loadingTasks ? <p role="status" className="mt-5 text-sm text-slate-600">Loading your open tasks…</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <form className="mt-5 space-y-5" onSubmit={(event) => void createPlan(event)}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium text-slate-700">
                Plan date
                <input type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} required className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Available from
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Total available minutes
                <input type="number" min={30} max={720} value={availableMinutes} onChange={(event) => setAvailableMinutes(event.target.value)} required className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Break length (minutes)
                <input type="number" min={5} max={30} value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))} required className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
            </div>
            <p className="text-xs text-slate-500">Times use your profile timezone ({timezone}). The available window includes scheduled breaks.</p>

            <fieldset className="rounded-2xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">Estimated task durations</legend>
              {!loadingTasks && tasks.length === 0 ? <p className="py-2 text-sm text-slate-500">{error ? 'Your task list is unavailable.' : 'No open tasks. Add tasks first, then return to build a plan.'}</p> : null}
              <ul className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <li key={task.taskId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {task.priority} priority · {task.status.replace('_', ' ')} · {task.dueDate ? `Due ${task.dueDate}` : 'No due date'}
                      </p>
                    </div>
                    <label className="shrink-0 text-xs text-slate-600">
                      Minutes (blank = assumed 30)
                      <input
                        aria-label={`Estimated minutes for ${task.title}`}
                        type="number"
                        min={10}
                        max={240}
                        value={durations[task.taskId] ?? ''}
                        onChange={(event) => setDurations((current) => ({ ...current, [task.taskId]: event.target.value }))}
                        placeholder="30"
                        className="ml-2 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                  </li>
                ))}
              </ul>
              {taskLimitHit ? <p className="mt-3 text-xs text-amber-800">Showing the first 100 open tasks. Narrow your task list before planning; additional tasks are not included.</p> : null}
            </fieldset>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={includeAI} onChange={(event) => setIncludeAI(event.target.checked)} />
                Include optional AI suggestions (falls back to rules if unavailable)
              </label>
              <button type="submit" disabled={planning || loadingTasks || !planDate || !startTime || !availableMinutes} className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60">
                {planning ? 'Building your plan…' : 'Build review-only plan'}
              </button>
            </div>
          </form>
      </section>

      {plan && interpretation ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Plan summary">
            <PlanStat label="Scheduled work" value={`${plan.scheduledWorkMinutes} min`} />
            <PlanStat label="Scheduled breaks" value={`${plan.scheduledBreakMinutes} min`} />
            <PlanStat label="Due today" value={plan.dueTodayCount} />
            <PlanStat label="Overdue" value={plan.overdueCount} />
          </section>

          {plan.deadlineConflicts.length ? (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-5 sm:p-6" aria-labelledby="deadline-conflicts-heading">
              <h2 id="deadline-conflicts-heading" className="font-semibold text-red-950">Deadline conflicts ({plan.deadlineConflicts.length})</h2>
              <ul className="mt-3 space-y-2 text-sm text-red-900">
                {plan.deadlineConflicts.map((conflict) => (
                  <li key={conflict.taskId} className="rounded-xl bg-white/70 p-3">
                    {conflict.title} · {conflict.reason === 'overdue' ? `overdue since ${conflict.dueDate}` : `due today (${conflict.dueDate}) but not scheduled`}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="font-semibold text-slate-900">Proposed schedule · {plan.planDate}</h2>
            <p className="mt-1 text-sm text-slate-600">{plan.unusedMinutes} minute(s) remain in the available window. Estimated durations are marked below.</p>
            {plan.taskLimitHit ? <p className="mt-2 text-sm text-amber-800">This plan considers only the first 100 open tasks.</p> : null}
            {plan.schedule.length === 0 ? <p className="mt-4 text-sm text-slate-600">No task fits this time window. Increase availability or shorten estimated durations.</p> : null}
            <ol className="mt-4 space-y-3">
              {plan.schedule.map((item, index) => item.kind === 'break' ? (
                <li key={`break-${index}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {item.startTime}–{item.endTime} · Break ({item.durationMinutes} min)
                </li>
              ) : (
                <li key={`${item.taskId}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <span className="text-sm tabular-nums text-slate-600">{item.startTime}–{item.endTime} · {item.durationMinutes} min</span>
                  </div>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {item.priority} priority{item.dueDate ? ` · due ${item.dueDate}` : ''}{item.durationAssumed ? ' · duration assumed' : ''}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {plan.notScheduled.length ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
              <h2 className="font-semibold text-amber-950">Does not fit the available time ({plan.notScheduled.length})</h2>
              <ul className="mt-3 space-y-2 text-sm text-amber-950">
                {plan.notScheduled.map((task) => (
                  <li key={task.taskId} className="rounded-xl bg-white/70 p-3">
                    {task.title} · {task.durationMinutes} min{task.durationAssumed ? ' (assumed)' : ''}{task.dueDate ? ` · due ${task.dueDate}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-3xl border border-indigo-100 bg-white p-5 sm:p-6">
            <h2 className="font-semibold text-slate-900">Planning notes</h2>
            <p className="mt-1 text-sm text-slate-600">
              {interpretation.source === 'ai_guided' ? 'AI selected these suggestions using schedule counts only.' : interpretation.source === 'disabled' ? 'AI suggestions were not requested.' : interpretation.source === 'not_needed' ? 'There were no open tasks to pass to the AI provider.' : 'Rules-based suggestions are shown because AI guidance was unavailable.'}
            </p>
            {interpretation.fallbackReason ? <p className="mt-1 text-xs text-slate-500">AI fallback: {interpretation.fallbackReason.replaceAll('_', ' ')}</p> : null}
            {interpretation.suggestions.length ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-700">{interpretation.suggestions.map((suggestion) => <li key={suggestion} className="rounded-xl bg-slate-50 p-3">{suggestion}</li>)}</ul>
            ) : <p className="mt-3 text-sm text-slate-500">No additional suggestions for this plan.</p>}
          </section>
        </>
      ) : null}
    </div>
  );
}

function PlanStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p></div>;
}
