import {
  AIConfigurationError,
  AIProviderAPIError,
  AIProviderTimeoutError,
  AIResponseError,
  mapAIProviderError,
} from '@/lib/ai/task-extraction';
import { generateStructuredOutput } from '@/lib/ai/structured-output';
import { Types } from 'mongoose';
import TaskModel from '@/models/Task';
import JournalEntryModel from '@/models/JournalEntry';
import MoodEntryModel from '@/models/MoodEntry';
import { weeklyReportInsightsSchema, type WeeklyReportInsights } from '@/lib/validations/ai-life-report';

const dayMilliseconds = 86_400_000;
const weekMilliseconds = 7 * dayMilliseconds;

type DailyCount = { _id: string; count: number };
type PriorityCount = { _id: 'low' | 'medium' | 'high'; count: number };
type MoodCount = { _id: { period: 'current' | 'previous'; mood: string }; count: number };

export type WeeklyReportFacts = {
  period: {
    startDate: string;
    endDate: string;
    complete: boolean;
    timezone: 'UTC';
  };
  generatedAt: string;
  tasks: {
    completedInPeriod: number;
    openNow: number;
    overdueNow: number;
    priorityCountsNow: Record<'low' | 'medium' | 'high', number>;
    completionsByDay: Array<{ date: string; count: number }>;
  };
  journal: {
    entriesInPeriod: number;
    entriesByDay: Array<{ date: string; count: number }>;
  };
  mood: null | {
    entriesInPeriod: number;
    entriesPreviousPeriod: number;
    countsByMood: Record<string, number>;
    previousCountsByMood: Record<string, number>;
  };
};

export type WeeklyInterpretation = {
  source: 'ai_guided' | 'rules_fallback';
  fallbackReason?: string;
  wins: string[];
  bottlenecks: string[];
  suggestions: string[];
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dailySeries(start: Date, endExclusive: Date, counts: DailyCount[]) {
  const values = new Map(counts.map(({ _id, count }) => [_id, count]));
  const result: Array<{ date: string; count: number }> = [];
  for (let cursor = start.valueOf(); cursor < endExclusive.valueOf(); cursor += dayMilliseconds) {
    const date = dayKey(new Date(cursor));
    result.push({ date, count: values.get(date) ?? 0 });
  }
  return result;
}

function countMoodPeriod(rows: MoodCount[], period: 'current' | 'previous') {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row._id.period === period) counts[row._id.mood] = row.count;
  }
  return counts;
}

export async function loadWeeklyReportFacts(userId: string, weekStart: string, now = new Date()): Promise<WeeklyReportFacts> {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const nextWeek = new Date(start.valueOf() + weekMilliseconds);
  const endExclusive = new Date(Math.min(nextWeek.valueOf(), Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)));
  const previousStart = new Date(start.valueOf() - weekMilliseconds);
  const currentMoment = new Date(now);
  const ownerId = new Types.ObjectId(userId);
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const openFilter = { userId, status: { $in: ['todo', 'in_progress'] } };

  const [completedInPeriod, openNow, overdueNow, priorities, completionRows, journalRows, journalCount, moodRows] = await Promise.all([
    TaskModel.countDocuments({ userId, status: 'completed', completedAt: { $gte: start, $lt: endExclusive } }),
    TaskModel.countDocuments(openFilter),
    TaskModel.countDocuments({ ...openFilter, dueDate: { $lt: todayEnd } }),
    TaskModel.aggregate<PriorityCount>([
      { $match: { userId: ownerId } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    TaskModel.aggregate<DailyCount>([
      { $match: { userId: ownerId, status: 'completed', completedAt: { $gte: start, $lt: endExclusive } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
    JournalEntryModel.aggregate<DailyCount>([
      { $match: { userId: ownerId, createdAt: { $gte: start, $lt: endExclusive } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
    JournalEntryModel.countDocuments({ userId, createdAt: { $gte: start, $lt: endExclusive } }),
    MoodEntryModel.aggregate<MoodCount>([
      { $match: { userId: ownerId, createdAt: { $gte: previousStart, $lt: endExclusive } } },
      {
        $group: {
          _id: {
            period: { $cond: [{ $lt: ['$createdAt', start] }, 'previous', 'current'] },
            mood: '$mood',
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const priorityCountsNow: WeeklyReportFacts['tasks']['priorityCountsNow'] = { low: 0, medium: 0, high: 0 };
  for (const row of priorities) priorityCountsNow[row._id] = row.count;

  const currentMoodCounts = countMoodPeriod(moodRows, 'current');
  const mood = Object.values(currentMoodCounts).reduce((sum, count) => sum + count, 0) > 0
    ? {
      entriesInPeriod: Object.values(currentMoodCounts).reduce((sum, count) => sum + count, 0),
      entriesPreviousPeriod: Object.values(countMoodPeriod(moodRows, 'previous')).reduce((sum, count) => sum + count, 0),
      countsByMood: currentMoodCounts,
      previousCountsByMood: countMoodPeriod(moodRows, 'previous'),
    }
    : null;
  const complete = endExclusive.valueOf() === nextWeek.valueOf();

  return {
    period: {
      startDate: weekStart,
      endDate: dayKey(new Date(endExclusive.valueOf() - dayMilliseconds)),
      complete,
      timezone: 'UTC',
    },
    generatedAt: currentMoment.toISOString(),
    tasks: {
      completedInPeriod,
      openNow,
      overdueNow,
      priorityCountsNow,
      completionsByDay: dailySeries(start, endExclusive, completionRows),
    },
    journal: {
      entriesInPeriod: journalCount,
      entriesByDay: dailySeries(start, endExclusive, journalRows),
    },
    mood,
  };
}

const insightCopy: Record<WeeklyReportInsights['insightCodes'][number], string> = {
  celebrate_completed_tasks: 'You completed tasks during this reporting period.',
  review_overdue_tasks: 'Review overdue work and decide what still needs attention.',
  focus_open_tasks: 'Choose a small number of open tasks to focus on first.',
  keep_next_week_realistic: 'Keep next week\'s plan realistic and leave room for breaks.',
};

function eligibleInsightCodes(facts: WeeklyReportFacts): WeeklyReportInsights['insightCodes'] {
  return [
    ...(facts.tasks.completedInPeriod > 0 ? ['celebrate_completed_tasks' as const] : []),
    ...(facts.tasks.overdueNow > 0 ? ['review_overdue_tasks' as const] : []),
    ...(facts.tasks.openNow > 0 ? ['focus_open_tasks' as const] : []),
    'keep_next_week_realistic',
  ];
}

function fallbackCodes(facts: WeeklyReportFacts): WeeklyReportInsights['insightCodes'] {
  const eligible = eligibleInsightCodes(facts);
  return [...eligible.filter((code) => code !== 'keep_next_week_realistic'), 'keep_next_week_realistic' as const].slice(0, 4);
}

function interpretationFromCodes(
  facts: WeeklyReportFacts,
  codes: WeeklyReportInsights['insightCodes'],
  source: WeeklyInterpretation['source'],
  fallbackReason?: string,
): WeeklyInterpretation {
  const allowed = new Set(eligibleInsightCodes(facts));
  const selected = [...new Set(codes)].filter((code) => allowed.has(code));
  const safeCodes = selected.length > 0 ? selected : fallbackCodes(facts);
  const usedRules = source === 'ai_guided' && selected.length === 0;
  return {
    source: usedRules ? 'rules_fallback' : source,
    ...(fallbackReason || usedRules ? { fallbackReason: fallbackReason ?? 'no_supported_ai_themes' } : {}),
    wins: safeCodes.includes('celebrate_completed_tasks')
      ? [`You completed ${facts.tasks.completedInPeriod} task${facts.tasks.completedInPeriod === 1 ? '' : 's'} during this reporting period.`]
      : [],
    bottlenecks: [
      ...(safeCodes.includes('review_overdue_tasks')
        ? [`${facts.tasks.overdueNow} task${facts.tasks.overdueNow === 1 ? ' is' : 's are'} currently overdue.`]
        : []),
      ...(!safeCodes.includes('review_overdue_tasks') && safeCodes.includes('focus_open_tasks')
        ? [`${facts.tasks.openNow} task${facts.tasks.openNow === 1 ? '' : 's'} remain open.`]
        : []),
    ],
    suggestions: safeCodes
      .filter((code) => code !== 'celebrate_completed_tasks')
      .map((code) => insightCopy[code]),
  };
}

export function weeklyReportFallback(facts: WeeklyReportFacts, fallbackReason?: string): WeeklyInterpretation {
  return interpretationFromCodes(facts, fallbackCodes(facts), 'rules_fallback', fallbackReason);
}

const providerSchema = {
  type: 'object',
  properties: {
    insightCodes: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: ['celebrate_completed_tasks', 'review_overdue_tasks', 'focus_open_tasks', 'keep_next_week_realistic'] },
    },
  },
  required: ['insightCodes'],
  additionalProperties: false,
};

export async function generateWeeklyInterpretation(facts: WeeklyReportFacts): Promise<WeeklyInterpretation> {
  const eligibleCodes = eligibleInsightCodes(facts);
  const result = await generateStructuredOutput({
    operation: 'weekly_report',
    systemInstruction: 'Choose only eligible insight codes supported by the supplied numeric facts. Do not infer health or psychological conclusions. Return JSON only.',
    prompt: JSON.stringify({
      period: facts.period,
      facts: {
        completedInPeriod: facts.tasks.completedInPeriod,
        openNow: facts.tasks.openNow,
        overdueNow: facts.tasks.overdueNow,
        priorityCountsNow: facts.tasks.priorityCountsNow,
        journalEntriesInPeriod: facts.journal.entriesInPeriod,
      },
      eligibleCodes,
    }),
    outputSchema: providerSchema,
    parse(value) {
      const parsed = weeklyReportInsightsSchema.safeParse(value);
      if (!parsed.success) throw new AIResponseError('The AI provider returned invalid weekly-report insights.');
      return parsed.data;
    },
  });
  return interpretationFromCodes(facts, result.insightCodes, 'ai_guided');
}

export function weeklyReportFallbackReason(error: unknown): string | undefined {
  if (error instanceof AIConfigurationError) return 'not_configured';
  if (error instanceof AIProviderTimeoutError) return 'timeout';
  if (error instanceof AIResponseError) return error.schemaValidationFailure ? 'invalid_output' : 'provider_unavailable';
  if (error instanceof AIProviderAPIError) return mapAIProviderError(error).code.toLowerCase();
  return undefined;
}
