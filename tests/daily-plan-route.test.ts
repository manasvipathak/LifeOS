/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  find: vi.fn(),
  generatePlannerInterpretation: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/models/Task', () => ({ default: { find: mocks.find } }));
vi.mock('@/lib/planning/daily-planner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/planning/daily-planner')>();
  return { ...actual, generatePlannerInterpretation: mocks.generatePlannerInterpretation };
});

import { GET, POST } from '@/app/api/ai/daily-plan/route';
import { AIProviderTimeoutError } from '@/lib/ai/task-extraction';

const user = { id: '64b000000000000000000099', name: 'Ava', email: 'ava@example.com', timezone: 'UTC' };
const today = new Date().toISOString().slice(0, 10);
const ownedTask = {
  _id: '64b000000000000000000001',
  title: 'Prepare a presentation',
  priority: 'high' as const,
  status: 'todo' as const,
  dueDate: new Date('2026-07-12T00:00:00.000Z'),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

function taskQuery(result = [ownedTask]) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
}

function request(body: unknown) {
  return new Request('http://localhost/api/ai/daily-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.find.mockReturnValue(taskQuery());
  mocks.generatePlannerInterpretation.mockResolvedValue({ source: 'ai_guided', suggestions: [] });
});

describe('/api/ai/daily-plan', () => {
  it('requires authentication for task listing and planning', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const list = await GET();
    const plan = await POST(request({ planDate: '2026-07-12', startTime: '09:00', availableMinutes: 120 }));

    expect(list.status).toBe(401);
    expect(plan.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('returns only owner-scoped task fields for the planning UI', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({ userId: user.id, status: { $in: ['todo', 'in_progress'] } });
    expect(body.tasks).toEqual([{
      taskId: ownedTask._id,
      title: ownedTask.title,
      priority: 'high',
      status: 'todo',
      dueDate: '2026-07-12',
      createdAt: '2026-07-01T00:00:00.000Z',
    }]);
    expect(JSON.stringify(body)).not.toContain('userId');
  });

  it('rejects client owner IDs and duration IDs not present in the authenticated user task set', async () => {
    const extraOwner = await POST(request({
      planDate: today,
      startTime: '09:00',
      availableMinutes: 120,
      userId: '64b000000000000000000001',
    }));
    const foreignTask = await POST(request({
      planDate: today,
      startTime: '09:00',
      availableMinutes: 120,
      taskDurations: [{ taskId: '64b000000000000000000002', minutes: 45 }],
      includeAI: false,
    }));

    expect(extraOwner.status).toBe(400);
    expect(foreignTask.status).toBe(400);
    expect(mocks.generatePlannerInterpretation).not.toHaveBeenCalled();
  });

  it('creates an in-memory schedule from the authenticated tasks without saving them', async () => {
    const response = await POST(request({
      planDate: today,
      startTime: '09:00',
      availableMinutes: 120,
      taskDurations: [{ taskId: ownedTask._id, minutes: 45 }],
      includeAI: false,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan.scheduledTaskIds).toEqual([ownedTask._id]);
    expect(body.plan.schedule[0]).toMatchObject({ kind: 'task', title: ownedTask.title, durationMinutes: 45, durationAssumed: false });
    expect(body.interpretation.source).toBe('disabled');
    expect(mocks.generatePlannerInterpretation).not.toHaveBeenCalled();
  });

  it('returns the deterministic schedule when the optional AI provider times out', async () => {
    mocks.generatePlannerInterpretation.mockRejectedValue(new AIProviderTimeoutError());

    const response = await POST(request({
      planDate: new Date().toISOString().slice(0, 10),
      startTime: '09:00',
      availableMinutes: 120,
      taskDurations: [{ taskId: ownedTask._id, minutes: 45 }],
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan.scheduledTaskIds).toEqual([ownedTask._id]);
    expect(body.interpretation.source).toBe('rules_fallback');
    expect(body.interpretation.fallbackReason).toBe('timeout');
  });

  it('does not call the provider for an empty open-task set', async () => {
    mocks.find.mockReturnValue(taskQuery([]));
    const response = await POST(request({
      planDate: today,
      startTime: '09:00',
      availableMinutes: 120,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan.schedule).toEqual([]);
    expect(body.interpretation.source).toBe('not_needed');
    expect(mocks.generatePlannerInterpretation).not.toHaveBeenCalled();
  });
});
