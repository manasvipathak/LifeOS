/// <reference types="vitest/globals" />

import {
  AIConfigurationError,
  AIProviderAPIError,
  AIProviderTimeoutError,
  AIResponseError,
  mapAIProviderError,
  recommendTaskPriorities,
} from '@/lib/ai/task-prioritization';
import { recommendTaskPriority } from '@/lib/tasks/priority-recommendation';
import { taskPrioritizationInputSchema } from '@/lib/validations/task-prioritization';

const taskId = '64b000000000000000000001';
const secondTaskId = '64b000000000000000000002';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rules-based task priority recommendations', () => {
  it('uses user-selected importance and deadline urgency transparently', () => {
    const recommendation = recommendTaskPriority(
      { priority: 'low', dueDate: '2026-01-17', status: 'todo' },
      new Date('2026-01-15T12:00:00.000Z'),
    );

    expect(recommendation).toMatchObject({
      priority: 'high',
      score: 3,
      explanation: expect.stringContaining('within three days'),
    });
  });

  it('does not change completed task priority', () => {
    const recommendation = recommendTaskPriority(
      { priority: 'low', dueDate: '2026-01-10', status: 'completed' },
      new Date('2026-01-15T12:00:00.000Z'),
    );

    expect(recommendation.priority).toBe('low');
    expect(recommendation.score).toBe(1);
    expect(recommendation.explanation).toContain('completed');
  });
});

describe('task prioritization validation and provider', () => {
  it('rejects duplicate task IDs and defaults to the rules-only mode', () => {
    expect(taskPrioritizationInputSchema.safeParse({ taskIds: [taskId, taskId] }).success).toBe(false);
    expect(taskPrioritizationInputSchema.parse({ taskIds: [taskId] }).includeLLM).toBe(false);
  });

  it('returns validated recommendations with exactly the supplied task IDs', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    vi.stubEnv('AI_MODEL', 'gpt-4o-mini');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendations: [
              { taskId, priority: 'high', explanation: 'The due date is close.' },
              { taskId: secondTaskId, priority: 'medium', explanation: 'The task is already medium priority.' },
            ],
          }),
        },
      }],
      usage: { prompt_tokens: 21, completion_tokens: 17 },
    }), { status: 200 })));

    const result = await recommendTaskPriorities([
      { taskId, priority: 'low', dueDate: '2026-01-17', status: 'todo' },
      { taskId: secondTaskId, priority: 'medium', dueDate: null, status: 'todo' },
    ]);

    expect(result.map(({ taskId: id }) => id)).toEqual([taskId, secondTaskId]);
    expect(result[0].priority).toBe('high');
  });

  it.each([
    '{broken json',
    JSON.stringify({ recommendations: [{ taskId, priority: 'urgent', explanation: 'Invalid priority.' }] }),
    JSON.stringify({ recommendations: [{ taskId: secondTaskId, priority: 'low', explanation: 'Wrong task ID.' }] }),
  ])('rejects malformed, invalid, or mismatched provider output', async (output) => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: output } }],
    }), { status: 200 })));

    await expect(recommendTaskPriorities([
      { taskId, priority: 'medium', dueDate: null, status: 'todo' },
    ])).rejects.toBeInstanceOf(AIResponseError);
  });

  it('fails clearly when the selected provider is not configured', async () => {
    vi.stubEnv('AI_PROVIDER', 'google');
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(recommendTaskPriorities([
      { taskId, priority: 'medium', dueDate: null, status: 'todo' },
    ])).rejects.toBeInstanceOf(AIConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps provider rate limits and distinguishes timeout from malformed response', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'rate_limit_exceeded', type: 'rate_limit_error', message: 'Too many requests.' },
    }), { status: 429 })));

    let providerError: unknown;
    try {
      await recommendTaskPriorities([{ taskId, priority: 'medium', dueDate: null, status: 'todo' }]);
    } catch (error) {
      providerError = error;
    }
    expect(providerError).toBeInstanceOf(AIProviderAPIError);
    expect(mapAIProviderError(providerError as AIProviderAPIError).code).toBe('AI_RATE_LIMITED');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')));
    await expect(recommendTaskPriorities([
      { taskId, priority: 'medium', dueDate: null, status: 'todo' },
    ])).rejects.toBeInstanceOf(AIProviderTimeoutError);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network is unreachable')));
    let networkError: unknown;
    try {
      await recommendTaskPriorities([{ taskId, priority: 'medium', dueDate: null, status: 'todo' }]);
    } catch (error) {
      networkError = error;
    }
    expect(networkError).toBeInstanceOf(AIResponseError);
    expect((networkError as AIResponseError).schemaValidationFailure).toBe(false);
  });
});
