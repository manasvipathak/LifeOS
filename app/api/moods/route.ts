import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import MoodEntryModel from '@/models/MoodEntry';
import { createMoodEntrySchema, moodHistoryQuerySchema } from '@/lib/validations/mood';

function moodEntryResponse(entry: { _id: unknown; mood: string; note?: string; createdAt: Date }) {
  return {
    id: String(entry._id),
    mood: entry.mood,
    note: entry.note ?? '',
    createdAt: new Date(entry.createdAt).toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const parsedQuery = moodHistoryQuerySchema.safeParse({ limit: params.get('limit') ?? undefined });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Mood history limit must be between 1 and 50.' } }, { status: 400 });
    }

    const filter = { userId: user.id };
    const [entries, total] = await Promise.all([
      MoodEntryModel.find(filter).sort({ createdAt: -1 }).limit(parsedQuery.data.limit).lean(),
      MoodEntryModel.countDocuments(filter),
    ]);

    return NextResponse.json({
      entries: entries.map(moodEntryResponse),
      pagination: { limit: parsedQuery.data.limit, total },
    });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to load mood history right now.' } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON.' } }, { status: 400 });
    }

    const parsed = createMoodEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Mood entry is invalid.' } }, { status: 400 });
    }

    const entry = await MoodEntryModel.create({ ...parsed.data, userId: user.id });

    return NextResponse.json({ entry: moodEntryResponse(entry) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to save your mood right now.' } }, { status: 500 });
  }
}