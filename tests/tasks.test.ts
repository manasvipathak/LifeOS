/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
  create: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/models/Task', () => ({
  default: {
    find: mocks.find,
    countDocuments: mocks.countDocuments,
    create: mocks.create,
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    findOneAndDelete: mocks.findOneAndDelete,
  },
}));

import { GET as listTasks, POST as createTask } from '@/app/api/tasks/route';
import { DELETE as deleteTask, GET as getTask, PATCH as updateTask } from '@/app/api/tasks/[taskId]/route';

const owner = { id: '64b000000000000000000001', name: 'Ava', email: 'ava@example.com', timezone: 'UTC' };

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    _id: '64b000000000000000000002',
    title: 'Review notes',
    description: '',
    status: 'todo',
    priority: 'medium',
    category: 'study',
    dueDate: null,
    source: 'manual',
    subtasks: [],
    completedAt: null,
    createdAt: new Date('2026-10-16T00:00:00.000Z'),
    updatedAt: new Date('2026-10-16T00:00:00.000Z'),
    ...overrides,
  };
}

function request(url: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

function itemContext(taskId = '64b000000000000000000002') {
  return { params: Promise.resolve({ taskId }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(owner);
});

describe('task API authorization and CRUD', () => {
  it('returns 401 for a task list without a current user', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await listTasks(request('http://localhost/api/tasks'));

    expect(response.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('lists only the authenticated user tasks', async () => {
    mocks.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([makeTask()]),
    });
    mocks.countDocuments.mockResolvedValue(1);

    const response = await listTasks(request('http://localhost/api/tasks?status=todo'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({ userId: owner.id, status: 'todo' });
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]).not.toHaveProperty('userId');
  });

  it('rejects client-supplied owner IDs when creating tasks', async () => {
    const response = await createTask(request('http://localhost/api/tasks', 'POST', {
      title: 'Review notes',
      userId: '64b000000000000000000099',
    }));

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates a task with the authenticated owner ID', async () => {
    mocks.create.mockResolvedValue(makeTask());

    const response = await createTask(request('http://localhost/api/tasks', 'POST', { title: 'Review notes', dueDate: null }));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review notes', dueDate: null, userId: owner.id }));
  });

  it('reads a task with both its ID and authenticated owner in the filter', async () => {
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(makeTask()) });

    const response = await getTask(request('http://localhost/api/tasks/64b000000000000000000002'), itemContext());

    expect(response.status).toBe(200);
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: '64b000000000000000000002', userId: owner.id });
  });

  it('returns 404 when a task is not owned by the current user', async () => {
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const response = await getTask(request('http://localhost/api/tasks/64b000000000000000000002'), itemContext());

    expect(response.status).toBe(404);
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: '64b000000000000000000002', userId: owner.id });
  });

  it('updates only a task owned by the current user', async () => {
    mocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(makeTask({ title: 'Updated' })) });

    const response = await updateTask(
      request('http://localhost/api/tasks/64b000000000000000000002', 'PATCH', { title: 'Updated' }),
      itemContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '64b000000000000000000002', userId: owner.id },
      { $set: { title: 'Updated' } },
      { new: true, runValidators: true },
    );
  });

  it('deletes only a task owned by the current user', async () => {
    mocks.findOneAndDelete.mockResolvedValue(makeTask());

    const response = await deleteTask(request('http://localhost/api/tasks/64b000000000000000000002', 'DELETE'), itemContext());

    expect(response.status).toBe(200);
    expect(mocks.findOneAndDelete).toHaveBeenCalledWith({ _id: '64b000000000000000000002', userId: owner.id });
  });
});