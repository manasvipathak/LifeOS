
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
  due_date?: string;
};

function getTaskDate(task: Task) {
  const value = task.dueDate ?? task.due_date;
  if (!value) return "";
  return value.slice(0, 10);
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadTasks() {
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) throw new Error("Failed to load tasks");

        const data = await response.json();
        const list = Array.isArray(data)
          ? data
          : data.tasks ?? data.data ?? [];

        setTasks(list);
      } catch {
        setError("Unable to load tasks. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    }

    loadTasks();
  }, []);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const monthName = month.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  const [selectedDate, setSelectedDate] = useState(todayKey);

  const selectedTasks = tasks.filter(
    (task) => getTaskDate(task) === selectedDate
  );

  function changeMonth(offset: number) {
    setMonth(new Date(year, monthIndex + offset, 1));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <p className="mt-2 text-sm text-slate-600">
          View your tasks by date and plan your month.
        </p>
      </div>

      {loading ? (
        <p className="rounded-2xl border p-6 text-slate-600">
          Loading your calendar...
        </p>
      ) : error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          {error}
        </p>
      ) : (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <button
                onClick={() => changeMonth(-1)}
                className="rounded-xl border px-4 py-2 hover:bg-slate-50"
                aria-label="Previous month"
              >
                ←
              </button>

              <h2 className="text-lg font-semibold text-slate-900">
                {monthName}
              </h2>

              <button
                onClick={() => changeMonth(1)}
                className="rounded-xl border px-4 py-2 hover:bg-slate-50"
                aria-label="Next month"
              >
                →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day) => (
                  <div
                    key={day}
                    className="py-2 text-center text-xs font-semibold text-slate-500 sm:text-sm"
                  >
                    {day}
                  </div>
                )
              )}

              {Array.from({ length: firstDay }, (_, index) => (
                <div key={`empty-${index}`} />
              ))}

              {Array.from({ length: daysInMonth }, (_, index) => {
                const day = index + 1;
                const dateKey = [
                  year,
                  String(monthIndex + 1).padStart(2, "0"),
                  String(day).padStart(2, "0"),
                ].join("-");

                const dayTasks = tasks.filter(
                  (task) => getTaskDate(task) === dateKey
                );

                const isSelected = selectedDate === dateKey;
                const isToday = todayKey === dateKey;

                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDate(dateKey)}
                    className={`min-h-16 rounded-xl border p-1 text-center sm:min-h-20 sm:p-2 ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                        isToday
                          ? "bg-indigo-600 font-semibold text-white"
                          : "text-slate-800"
                      }`}
                    >
                      {day}
                    </span>

                    {dayTasks.length > 0 && (
                      <span className="mt-1 block truncate text-xs font-medium text-indigo-600">
                        {dayTasks.length} task{dayTasks.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="font-semibold text-slate-900">
              Tasks for{" "}
              {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                "en-IN",
                { day: "numeric", month: "long", year: "numeric" }
              )}
            </h2>

            {selectedTasks.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No tasks scheduled for this date. Select another date to view
                its tasks.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {selectedTasks.map((task, index) => {
                  const completed =
                    task.completed === true ||
                    task.status?.toLowerCase() === "completed";

                  return (
                    <div
                      key={task._id ?? task.id ?? `${task.title}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-2xl border p-4"
                    >
                      <div>
                        <p
                          className={`font-medium ${
                            completed
                              ? "text-slate-400 line-through"
                              : "text-slate-800"
                          }`}
                        >
                          {task.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {task.priority ?? "No priority"} ·{" "}
                          {completed ? "Completed" : "Pending"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <p className="text-sm text-slate-500">
            {tasks.filter((task) => !getTaskDate(task)).length} task(s) have no
            due date and are not displayed on the calendar.
          </p>
        </>
      )}
    </div>
  );
}
