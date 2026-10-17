/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  find: vi.fn(),
  recommendTaskPriorities: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/models/Task', () => ({ default: { find: mocks.find } }));
vi.mock('@/lib/ai/task-prioritization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/task-prioritization')>();
  return { ...actual, recommendTaskPriorities: mocks.recommendTaskPriorities };
});

import { POST } from '@/app/api/ai/prioritize-tasks/route';

const owner = { id: '64b000000000000000000099', name: 'Ava', email: 'ava@example.com', timezone: 'UTC' };
const taskId = '64b000000000000000000001';

function request(body: unknown) {
  return new Request('http://localhost/api/ai/prioritize-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(owner);
  mocks.find.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([{
      _id: taskId,
      title: 'private task title should not leave the server',
      description: 'private task description should not reach a provider',
      priority: 'low',
      dueDate: new Date('2026-01-17T00:00:00.000Z'),
      status: 'todo',
    }]),
  });
});

describe('POST /api/ai/prioritize-tasks', () => {
  it('requires authentication before looking up tasks', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(request({ taskIds: [taskId] }));

    expect(response.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('validates unique IDs and returns the rules baseline without requiring an LLM', async () => {
    const duplicateResponse = await POST(request({ taskIds: [taskId, taskId] }));
    expect(duplicateResponse.status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();

    const response = await POST(request({ taskIds: [taskId] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({ _id: { $in: [taskId] }, userId: owner.id });
    expect(body.baseline[0]).toMatchObject({ taskId, priority: 'high' });
    expect(body.recommendations).toEqual([]);
    expect(mocks.recommendTaskPriorities).not.toHaveBeenCalled();
  });

  it('only requests optional LLM recommendations when explicitly enabled', async () => {
    mocks.recommendTaskPriorities.mockResolvedValue([{
      taskId,
      priority: 'medium',
      explanation: 'A model suggestion for comparison.',
    }]);

    const response = await POST(request({ taskIds: [taskId], includeLLM: true }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.recommendTaskPriorities).toHaveBeenCalledWith([{
      taskId,
      priority: 'low',
      dueDate: '2026-01-17',
      status: 'todo',
    }]);
    expect(body.recommendations[0].priority).toBe('medium');
  });

  it('does not return another user task when the owner-scoped query cannot find it', async () => {
    mocks.find.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });

    const response = await POST(request({ taskIds: [taskId] }));

    expect(response.status).toBe(404);
    expect(mocks.find).toHaveBeenCalledWith({ _id: { $in: [taskId] }, userId: owner.id });
    expect(mocks.recommendTaskPriorities).not.toHaveBeenCalled();
  });
});
