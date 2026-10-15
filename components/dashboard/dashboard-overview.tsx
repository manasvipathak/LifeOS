'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, CheckCircle2, Clock3 } from 'lucide-react';
import { MoodSnapshot } from '@/components/mood/mood-snapshot';
import { dailyFocusEmptyMessage, getDailyFocusView, type DailyFocusTask } from '@/lib/tasks/daily-focus';

type Task = DailyFocusTask & {
  id: string;
  title: string;
};

type TaskListResponse = {
  tasks: Task[];
  pagination: { total: number };
};

type DashboardTaskSummary = {
  openCount: number;
  completedCount: number;
  upcoming: Task[];
  dailyFocus: Task[];
};

async function getTasks(query: URLSearchParams): Promise<TaskListResponse> {
  const response = await fetch(`/api/tasks?${query.toString()}`);
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error?.message ?? 'Unable to load your task summary.');
  }

  if (!Array.isArray(result?.tasks) || typeof result?.pagination?.total !== 'number') {
    throw new Error('The task summary response was invalid.');
  }

  return result as TaskListResponse;
}

function localDate(timezone: string): string {
  let safeTimezone = 'UTC';

  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    safeTimezone = timezone;
  } catch {
    // Invalid profile timezones use the same UTC fallback as task extraction.
  }

  const parts = new Intl.DateTimeFormat('en', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function formatDueDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function getAllPendingTasks(status: 'todo' | 'in_progress') {
  const tasks: Task[] = [];
  let page = 1;
  let total = 0;

  do {
    const query = new URLSearchParams({ status, page: String(page), limit: '100' });
    const result = await getTasks(query);
    tasks.push(...result.tasks);
    total = result.pagination.total;
    page += 1;
  } while (tasks.length < total);

  return { tasks, total };
}

export function DashboardOverview({ name, timezone }: { name?: string | null; timezone: string }) {
  const [summary, setSummary] = useState<DashboardTaskSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const dueAfter = localDate(timezone);
    const statusQuery = (status: Task['status'], limit: number, includeDueAfter = false) => {
      const query = new URLSearchParams({ status, page: '1', limit: String(limit) });
      if (includeDueAfter) query.set('dueAfter', dueAfter);
      return getTasks(query);
    };

    Promise.all([
      getAllPendingTasks('todo'),
      getAllPendingTasks('in_progress'),
      statusQuery('completed', 1),
    ])
      .then(([todoTasks, inProgressTasks, completedCount]) => {
        if (!active) return;
        const pendingTasks = [...todoTasks.tasks, ...inProgressTasks.tasks];
        const upcoming = pendingTasks
          .filter((task) => task.dueDate !== null && task.dueDate.slice(0, 10) >= dueAfter)
          .sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? ''))
          .slice(0, 5);
        const dailyFocus = getDailyFocusView(pendingTasks);

        setSummary({
          openCount: todoTasks.total + inProgressTasks.total,
          completedCount: completedCount.pagination.total,
          upcoming,
          dailyFocus: dailyFocus.tasks,
        });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load your task summary.');
      });

    return () => {
      active = false;
    };
  }, [timezone]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-brand-100 bg-brand-50 p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Welcome back</p>
        <h2 className="mt-3 text-3xl font-bold text-slate-900">Hello, {name || 'there'}.</h2>
        <p className="mt-3 max-w-2xl text-base text-slate-600">Your task progress and upcoming deadlines, all in one place.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="card-surface p-5 md:col-span-2 xl:col-span-2" aria-labelledby="upcoming-tasks-heading">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-brand-700" />
              <h3 id="upcoming-tasks-heading" className="font-semibold text-slate-900">Upcoming tasks</h3>
            </div>
            <Link href="/dashboard/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              All tasks <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {error ? <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {!summary && !error ? <p className="mt-4 py-4 text-sm text-slate-500">Loading your tasks...</p> : null}
          {summary && summary.upcoming.length === 0 ? <p className="mt-4 py-4 text-sm text-slate-500">No upcoming tasks with a due date.</p> : null}

          {summary && summary.upcoming.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-200">
              {summary.upcoming.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                    <p className="mt-1 text-xs capitalize text-slate-500">{task.status.replace('_', ' ')} · {task.priority} priority</p>
                  </div>
                  <span className="shrink-0 text-sm text-slate-600">{task.dueDate ? formatDueDate(task.dueDate) : 'No due date'}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="card-surface p-5" aria-labelledby="task-progress-heading">
          <h3 id="task-progress-heading" className="font-semibold text-slate-900">Task progress</h3>
          {!summary && !error ? <p className="mt-4 text-sm text-slate-500">Loading summary...</p> : null}
          {error ? <p className="mt-4 text-sm text-slate-500">Task counts are unavailable.</p> : null}
          {summary ? (
            <dl className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm text-slate-600"><Clock3 className="h-4 w-4 text-amber-600" /> Pending</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900">{summary.openCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 text-green-700" /> Completed</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900">{summary.completedCount}</dd>
              </div>
            </dl>
          ) : null}
        </section>

        <section className="card-surface p-5" aria-labelledby="daily-focus-heading">
          <h3 id="daily-focus-heading" className="font-semibold text-slate-900">Daily Focus</h3>
          {!summary && !error ? <p className="mt-4 text-sm text-slate-500">Loading your focus list...</p> : null}
          {error ? <p className="mt-4 text-sm text-slate-500">Daily Focus is unavailable right now.</p> : null}
          {summary?.dailyFocus.length === 0 ? <p className="mt-4 text-sm text-slate-600">{dailyFocusEmptyMessage}</p> : null}
          {summary && summary.dailyFocus.length > 0 ? (
            <ol className="mt-3 divide-y divide-slate-200">
              {summary.dailyFocus.map((task, index) => (
                <li key={task.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-slate-900">{task.title}</p>
                    <p className="mt-1 text-xs capitalize text-slate-500">{task.priority} priority · {task.dueDate ? formatDueDate(task.dueDate) : 'No due date'}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        <MoodSnapshot />
      </div>
    </div>
  );
}