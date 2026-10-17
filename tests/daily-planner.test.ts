/// <reference types="vitest/globals" />

import { AIConfigurationError, AIProviderTimeoutError } from '@/lib/ai/task-extraction';
import {
  buildDailyPlan,
  generatePlannerInterpretation,
  plannerFallback,
  plannerFallbackReason,
  type PlannerTask,
} from '@/lib/planning/daily-planner';

const input = {
  planDate: '2026-07-12',
  startTime: '09:00',
  availableMinutes: 120,
  breakMinutes: 10,
  timezone: 'UTC',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function task(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    taskId: '64b000000000000000000001',
    title: 'Synthetic task title',
    priority: 'medium',
    status: 'todo',
    dueDate: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    durationMinutes: 30,
    durationAssumed: false,
    ...overrides,
  };
}

describe('daily planner', () => {
  it('orders overdue tasks, then earlier due dates and selected priority', () => {
    const plan = buildDailyPlan([
      task({ taskId: 'later', dueDate: '2026-07-14', priority: 'high' }),
      task({ taskId: 'overdue', dueDate: '2026-07-11', priority: 'low' }),
      task({ taskId: 'today', dueDate: '2026-07-12', priority: 'medium' }),
    ], input);

    expect(plan.scheduledTaskIds).toEqual(['overdue', 'today', 'later']);
    expect(plan.overdueCount).toBe(1);
    expect(plan.dueTodayCount).toBe(1);
  });

  it('splits sustained work around breaks and never exceeds the available window', () => {
    const plan = buildDailyPlan([
      task({ durationMinutes: 75 }),
      task({ taskId: 'second', durationMinutes: 20 }),
    ], { ...input, availableMinutes: 130 });

    expect(plan.schedule.filter((item) => item.kind === 'break')).toHaveLength(1);
    expect(plan.scheduledWorkMinutes).toBe(95);
    expect(plan.scheduledBreakMinutes).toBe(10);
    expect(plan.unusedMinutes).toBe(25);
    expect(plan.schedule.reduce((sum, item) => sum + item.durationMinutes, 0)).toBeLessThanOrEqual(130);
  });

  it('keeps duration assumptions explicit and reports work that does not fit', () => {
    const assumed = task({ durationMinutes: 30, durationAssumed: true });
    const tooLong = task({ taskId: 'too-long', durationMinutes: 60 });
    const plan = buildDailyPlan([assumed, tooLong], { ...input, availableMinutes: 45 });

    expect(plan.schedule.some((item) => item.kind === 'task' && item.durationAssumed)).toBe(true);
    expect(plan.notScheduled.map(({ taskId }) => taskId)).toEqual(['too-long']);
  });

  it('uses only schedule counts for optional AI guidance and filters unsupported codes', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key-not-a-secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ insightCodes: ['review_overdue_work'] }) } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const plan = buildDailyPlan([task({ dueDate: null })], input);
    const result = await generatePlannerInterpretation(plan);
    const providerRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(result.source).toBe('rules_fallback');
    expect(result.fallbackReason).toBe('no_supported_ai_themes');
    expect(result.suggestions).toEqual([]);
    expect(JSON.stringify(providerRequest)).not.toContain('Synthetic task title');
    expect(JSON.stringify(providerRequest)).not.toContain('taskId');
  });

  it('falls back safely for provider configuration and timeouts', () => {
    const plan = buildDailyPlan([task({ dueDate: '2026-07-11' })], input);

    expect(plannerFallbackReason(new AIConfigurationError())).toBe('not_configured');
    expect(plannerFallbackReason(new AIProviderTimeoutError())).toBe('timeout');
    expect(plannerFallback(plan).suggestions).toContain('Review overdue work before taking on additional tasks.');
  });
});
