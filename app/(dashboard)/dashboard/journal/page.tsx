
"use client";

import { useCallback, useEffect, useState } from "react";

type JournalEntry = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadEntries = useCallback(async () => {
    const response = await fetch("/api/journal");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error?.message ?? "Could not load journal entries."
      );
    }

    setEntries(data.entries ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchEntries() {
      try {
        const response = await fetch("/api/journal");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error?.message ?? "Could not load journal entries."
          );
        }

        if (!cancelled) {
          setEntries(data.entries ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load journal entries."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchEntries();

    return () => {
      cancelled = true;
    };
  }, []);

  function startEditing(entry: JournalEntry) {
    setEditingId(entry.id);
    setTitle(entry.title);
    setContent(entry.content);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setError("");
    setMessage("");
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const isEditing = editingId !== null;
      const response = await fetch(
        isEditing ? `/api/journal/${editingId}` : "/api/journal",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            content: content.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message ?? "Could not save your entry."
        );
      }

      setTitle("");
      setContent("");
      setEditingId(null);
      setMessage(
        isEditing
          ? "Journal entry updated successfully!"
          : "Your journal entry has been saved!"
      );

      await loadEntries();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your entry."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: JournalEntry) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${entry.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setDeletingId(entry.id);

    try {
      const response = await fetch(`/api/journal/${entry.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message ?? "Could not delete this entry."
        );
      }

      if (editingId === entry.id) {
        setEditingId(null);
        setTitle("");
        setContent("");
      }

      await loadEntries();
      setMessage("Journal entry deleted successfully!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete this entry."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">My Journal</h1>
        <p className="mt-2 text-sm text-slate-600">
          Make space for your thoughts, reflect on your day, and keep track
          of your personal growth.
        </p>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {editingId ? "Edit journal entry" : "Write a new entry"}
        </h2>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="journal-title"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Title
            </label>
            <input
              id="journal-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
              placeholder="Give today's reflection a title"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label
              htmlFor="journal-content"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Your thoughts
            </label>
            <textarea
              id="journal-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={10000}
              required
              rows={6}
              placeholder="How was your day? What went well? What would you like to improve?"
              className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-1 text-right text-xs text-slate-500">
              {content.length}/10000 characters
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {message && (
            <p role="status" className="text-sm text-green-700">
              {message}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving || !title.trim() || !content.trim()}
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Save changes"
                  : "Save journal entry"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Your journal history
          </h2>
          <span className="text-sm text-slate-500">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        {loading ? (
          <p className="rounded-2xl border p-5 text-sm text-slate-500">
            Loading your entries...
          </p>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <h3 className="font-semibold text-slate-800">
              Your story starts here
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Save your first reflection above. It will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900">
                      {entry.title}
                    </h3>
                    <time
                      dateTime={entry.createdAt}
                      className="mt-1 block text-xs text-slate-500"
                    >
                      {new Date(entry.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(entry)}
                      disabled={saving || deletingId !== null}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(entry)}
                      disabled={saving || deletingId !== null}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === entry.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {entry.content}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
