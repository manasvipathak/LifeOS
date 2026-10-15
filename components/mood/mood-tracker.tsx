'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Heart, LoaderCircle } from 'lucide-react';
import { moodOptions, type MoodValue } from '@/lib/mood/constants';

type MoodEntry = {
  id: string;
  mood: MoodValue;
  note: string;
  createdAt: string;
};

async function readJson(response: Response) {
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message ?? 'The mood request could not be completed.');
  return result;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function MoodTracker() {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [selectedMood, setSelectedMood] = useState<MoodValue | ''>('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch('/api/moods?limit=30')
      .then(readJson)
      .then((result) => {
        if (active) setEntries(result.entries);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load mood history.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function saveMood(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!selectedMood) {
      setError('Choose a mood before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/moods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: selectedMood, note }),
      });
      const result = await readJson(response);
      setEntries((current) => [result.entry as MoodEntry, ...current].slice(0, 30));
      setSelectedMood('');
      setNote('');
      setMessage('Mood saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your mood.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="log-mood-heading" className="border-b border-slate-200 pb-8">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-brand-700" />
          <h2 id="log-mood-heading" className="text-lg font-semibold text-slate-900">How are you feeling?</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">Choose the mood that best fits right now. A note is optional.</p>

        <form onSubmit={saveMood} className="mt-5 max-w-3xl space-y-5">
          <fieldset>
            <legend className="sr-only">Select a mood</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {moodOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border px-3 py-3 text-center transition ${selectedMood === option.value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:border-slate-400'}`}
                >
                  <input
                    type="radio"
                    name="mood"
                    value={option.value}
                    checked={selectedMood === option.value}
                    onChange={() => setSelectedMood(option.value)}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className="text-3xl">{option.emoji}</span>
                  <span className="text-sm font-medium text-slate-800">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="label-text">Note <span className="font-normal text-slate-500">(optional)</span></span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={280}
              rows={3}
              placeholder="Add a short note..."
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
            />
            <span className="mt-1 block text-right text-xs text-slate-500">{note.length}/280</span>
          </label>

          {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {message ? <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</p> : null}

          <button type="submit" disabled={isSaving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save mood'}
          </button>
        </form>
      </section>

      <section aria-labelledby="mood-history-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="mood-history-heading" className="text-lg font-semibold text-slate-900">Recent mood history</h2>
          <span className="text-sm text-slate-500">Last 30 entries</span>
        </div>

        {isLoading ? <p className="py-6 text-sm text-slate-500">Loading mood history...</p> : null}
        {!isLoading && !error && entries.length === 0 ? <p className="py-6 text-sm text-slate-500">No moods logged yet.</p> : null}

        <ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
          {entries.map((entry) => {
            const option = moodOptions.find((item) => item.value === entry.mood);
            if (!option) return null;

            return (
              <li key={entry.id} className="flex items-start gap-3 py-4">
                <span aria-hidden="true" className="text-2xl">{option.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium text-slate-900">{option.label}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-slate-500">{formatTimestamp(entry.createdAt)}</time>
                  </div>
                  {entry.note ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{entry.note}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}