'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Heart } from 'lucide-react';
import { moodOptions, type MoodValue } from '@/lib/mood/constants';

type MoodEntry = {
  id: string;
  mood: MoodValue;
  note: string;
  createdAt: string;
};

export function MoodSnapshot() {
  const [entry, setEntry] = useState<MoodEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch('/api/moods?limit=1')
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error?.message ?? 'Unable to load your latest mood.');
        return result;
      })
      .then((result) => {
        if (active) setEntry(result.entries[0] ?? null);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load your latest mood.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const option = entry ? moodOptions.find((item) => item.value === entry.mood) : null;

  return (
    <section className="card-surface p-5" aria-labelledby="mood-snapshot-heading">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-brand-700" />
        <h3 id="mood-snapshot-heading" className="font-semibold text-slate-900">Mood Snapshot</h3>
      </div>
      {isLoading ? <p className="mt-3 text-sm text-slate-500">Loading latest mood...</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {!isLoading && !error && !entry ? (
        <div className="mt-3">
          <p className="text-sm text-slate-600">No mood logged yet.</p>
          <Link href="/dashboard/mood" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
            Log a mood <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
      {entry && option ? (
        <div className="mt-3 flex items-start gap-3">
          <span aria-hidden="true" className="text-3xl">{option.emoji}</span>
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{option.label}</p>
            <time dateTime={entry.createdAt} className="mt-1 block text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
            {entry.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{entry.note}</p> : null}
            <Link href="/dashboard/mood" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              View history <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}