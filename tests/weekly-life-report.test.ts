/// <reference types="vitest/globals" />

import { Types } from 'mongoose';
import { AIConfigurationError, AIProviderAPIError, AIProviderTimeoutError, mapAIProviderError } from '@/lib/ai/task-extraction';
import { generateWeeklyInterpretation, loadWeeklyReportFacts, weeklyReportFallback, type WeeklyReportFacts } from '@/lib/reports/weekly-life-report';

const mocks = vi.hoisted(() => ({
  taskCountDocuments: vi.fn(),
  taskAggregate: vi.fn(),
  journalCountDocuments: vi.fn(),
  journalAggregate: vi.fn(),
  moodAggregate: vi.fn(),
}));

vi.mock('@/models/Task', () => ({
  default: { countDocuments: mocks.taskCountDocuments, aggregate: mocks.taskAggregate },
}));
vi.mock('@/models/JournalEntry', () => ({
  default: { countDocuments: mocks.journalCountDocuments, aggregate: mocks.journalAggregate },
}));
vi.mock('@/models/MoodEntry', () => ({ default: { aggregate: mocks.moodAggregate } }));

const facts: WeeklyReportFacts = {
  period: { startDate: '2026-01-19', endDate: '2026-01-25', complete: true, timezone: 'UTC' },
  generatedAt: '2026-01-26T00:00:00.000Z',
  tasks: {
    completedInPeriod: 2,
    openNow: 3,
    overdueNow: 1,
    priorityCountsNow: { low: 1, medium: 2, high: 3 },
    completionsByDay: [],
  },
  journal: { entriesInPeriod: 1, entriesByDay: [] },
  mood: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('weekly report statistics and AI interpretation', () => {
  it('scopes every report query to the authenticated owner and excludes journal content from aggregations', async () => {
    mocks.taskCountDocuments.mockImplementation((filter: Record<string, unknown>) => Promise.resolve(filter.status === 'completed' ? 2 : filter.dueDate ? 1 : 3));
    mocks.taskAggregate.mockImplementation((pipeline: Array<Record<string, unknown>>) => {
      const groupStage = pipeline.find((stage) => '$group' in stage)?.$group as { _id?: unknown } | undefined;
      return Promise.resolve(groupStage?._id === '$priority'
        ? [{ _id: 'high', count: 1 }]
        : [{ _id: '2026-01-20', count: 2 }]);
    });
    mocks.journalCountDocuments.mockResolvedValue(1);
    mocks.journalAggregate.mockResolvedValue([{ _id: '2026-01-21', count: 1 }]);
    mocks.moodAggregate.mockResolvedValue([{ _id: { period: 'current', mood: 'happy' }, count: 1 }]);

    const ownerId = '64b000000000000000000099';
    const result = await loadWeeklyReportFacts(ownerId, '2026-01-19', new Date('2026-01-26T00:00:00.000Z'));

    expect(mocks.taskCountDocuments).toHaveBeenCalledWith(expect.objectContaining({ userId: ownerId }));
    expect(mocks.journalCountDocuments).toHaveBeenCalledWith(expect.objectContaining({ userId: ownerId }));
    const aggregationCalls = [...mocks.taskAggregate.mock.calls, ...mocks.journalAggregate.mock.calls, ...mocks.moodAggregate.mock.calls];
    expect(aggregationCalls.every((call) => call[0][0].$match.userId instanceof Types.ObjectId)).toBe(true);
    expect(aggregationCalls.map((call) => String(call[0][0].$match.userId))).toEqual([ownerId, ownerId, ownerId, ownerId]);
    const journalPipeline = mocks.journalAggregate.mock.calls[0][0];
    expect(JSON.stringify(journalPipeline)).not.toContain('content');
    expect(result.mood?.countsByMood).toEqual({ happy: 1 });
    expect(result.journal.entriesInPeriod).toBe(1);
  });

  it('keeps fallback findings tied to actual weekly counts', () => {
    const interpretation = weeklyReportFallback(facts);
    expect(interpretation.wins).toEqual(['You completed 2 tasks during this reporting period.']);
    expect(interpretation.bottlenecks).toEqual(['1 task is currently overdue.']);
    expect(interpretation.source).toBe('rules_fallback');
  });

  it('sends only aggregated facts and accepts validated insight codes from OpenAI', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key-not-a-secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ insightCodes: ['celebrate_completed_tasks', 'review_overdue_tasks'] }) } }],
      usage: { prompt_tokens: 28, completion_tokens: 12 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateWeeklyInterpretation(facts);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(result.source).toBe('ai_guided');
    expect(result.wins[0]).toContain('2 tasks');
    expect(result.bottlenecks[0]).toContain('1 task');
    expect(JSON.stringify(requestBody)).not.toContain('private journal text');
    expect(JSON.stringify(requestBody)).not.toContain('mood');
    expect(String(fetchMock.mock.calls[0][1].headers.Authorization)).toContain('Bearer ');
  });

  it('does not accept AI themes unsupported by the supplied facts', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key-not-a-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ insightCodes: ['review_overdue_tasks'] }) } }],
    }), { status: 200 })));

    const noOverdue = { ...facts, tasks: { ...facts.tasks, overdueNow: 0 } };
    const result = await generateWeeklyInterpretation(noOverdue);

    expect(result.source).toBe('rules_fallback');
    expect(result.fallbackReason).toBe('no_supported_ai_themes');
    expect(result.bottlenecks).toEqual(['3 tasks remain open.']);
    expect(result.suggestions).not.toContain('Review overdue work and decide what still needs attention.');
  });

  it('converts malformed provider JSON into a validation failure', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key-not-a-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{broken' } }],
    }), { status: 200 })));

    await expect(generateWeeklyInterpretation(facts)).rejects.toMatchObject({ name: 'AIResponseError', schemaValidationFailure: true });
  });

  it('reports missing configuration, timeouts, and rate limits without retrying', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateWeeklyInterpretation(facts)).rejects.toBeInstanceOf(AIConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key-not-a-secret');
    fetchMock.mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'));
    await expect(generateWeeklyInterpretation(facts)).rejects.toBeInstanceOf(AIProviderTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: 'rate_limit_exceeded', type: 'rate_limit_error' },
    }), { status: 429 }));
    let providerError: unknown;
    try {
      await generateWeeklyInterpretation(facts);
    } catch (error) {
      providerError = error;
    }
    expect(providerError).toBeInstanceOf(AIProviderAPIError);
    expect(mapAIProviderError(providerError as AIProviderAPIError).code).toBe('AI_RATE_LIMITED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('supports Google Gemini through the configured server-side provider selection', async () => {
    vi.stubEnv('AI_PROVIDER', 'google');
    vi.stubEnv('GOOGLE_API_KEY', 'synthetic-google-key-not-a-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ insightCodes: ['focus_open_tasks'] }) }] } }],
      usageMetadata: { promptTokenCount: 14, candidatesTokenCount: 8 },
    }), { status: 200 })));

    const result = await generateWeeklyInterpretation(facts);

    expect(result.source).toBe('ai_guided');
    expect(result.suggestions).toContain('Choose a small number of open tasks to focus on first.');
  });
});
