
"use client";

import { useEffect, useState } from "react";

type Task = {
  _id?: string;
  id?: string;
  title: string;
  completed?: boolean;
  status?: string;
  priority?: string;
  dueDate?: string;
};

export default function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadTasks() {
      try {
        const response = await fetch("/api/tasks");

        if (!response.ok) {
          throw new Error("Could not load your tasks.");
        }

        const data = await response.json();
        const list = Array.isArray(data)
          ? data
          : data.tasks ?? data.data ?? [];

        setTasks(list);
      } catch {
        setError("Unable to load analytics. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    }

    loadTasks();
  }, []);

  const isCompleted = (task: Task) =>
    task.completed === true || task.status?.toLowerCase() === "completed";

  const completed = tasks.filter(isCompleted).length;
  const pending = tasks.length - completed;
  const completionRate = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  const priorities = ["High", "Medium", "Low"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Analytics
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Understand your productivity and track your progress.
        </p>
      </div>

      {loading ? (
        <p className="rounded-2xl border p-6 text-slate-600">
          Loading your analytics...
        </p>
      ) : error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Total tasks" value={tasks.length} />
            <StatCard label="Completed" value={completed} />
            <StatCard label="Pending" value={pending} />
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold text-slate-900">
                Completion progress
              </h2>
              <span className="text-lg font-bold text-indigo-600">
                {completionRate}%
              </span>
            </div>

            <div
              className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Task completion progress"
              aria-valuenow={completionRate}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>

            <p className="mt-3 text-sm text-slate-500">
              {completed} of {tasks.length} tasks completed.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold text-slate-900">
              Pending tasks by priority
            </h2>

            <div className="mt-5 space-y-5">
              {priorities.map((priority) => {
                const count = tasks.filter(
                  (task) =>
                    !isCompleted(task) &&
                    task.priority?.toLowerCase() === priority.toLowerCase()
                ).length;

                const percentage = pending
                  ? Math.round((count / pending) * 100)
                  : 0;

                return (
                  <div key={priority}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-slate-700">{priority}</span>
                      <span className="font-medium text-slate-900">
                        {count}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {tasks.length === 0 && (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
              No tasks yet. Add tasks from your dashboard to see your analytics.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
