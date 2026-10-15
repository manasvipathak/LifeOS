import { NextResponse } from 'next/server';
import TaskModel from '@/models/Task';
import { getCurrentUser } from '@/lib/auth/session';
import { createTaskSchema, listTasksQuerySchema } from '@/lib/validations/tasks';

function taskResponse(task: {
  _id: unknown;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category: string;
  dueDate?: Date | null;
  source: string;
  subtasks?: Array<{ title: string; done: boolean; createdAt: Date }>;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(task._id),
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    category: task.category,
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
    source: task.source,
    subtasks: (task.subtasks ?? []).map((subtask) => ({
      title: subtask.title,
      done: subtask.done,
      createdAt: new Date(subtask.createdAt).toISOString(),
    })),
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const filters = listTasksQuerySchema.safeParse({
      status: params.get('status') ?? undefined,
      priority: params.get('priority') ?? undefined,
      category: params.get('category') ?? undefined,
      dueBefore: params.get('dueBefore') ?? undefined,
      dueAfter: params.get('dueAfter') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });

    if (!filters.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: filters.error.issues[0]?.message ?? 'Task filters are invalid.' } }, { status: 400 });
    }

    const { page, limit, ...options } = filters.data;
    const filter: Record<string, unknown> = { userId: user.id };

    if (options.status) filter.status = options.status;
    if (options.priority) filter.priority = options.priority;
    if (options.category) filter.category = options.category;
    if (options.dueBefore || options.dueAfter) {
      filter.dueDate = {
        ...(options.dueAfter ? { $gte: options.dueAfter } : {}),
        ...(options.dueBefore ? { $lte: options.dueBefore } : {}),
      };
    }

    const [tasks, total] = await Promise.all([
      TaskModel.find(filter).sort({ dueDate: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      TaskModel.countDocuments(filter),
    ]);

    return NextResponse.json({
      tasks: tasks.map(taskResponse),
      pagination: { page, limit, total },
    });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to load tasks right now.' } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON.' } }, { status: 400 });
  }

  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Task input is invalid.' } }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
    }

    const task = await TaskModel.create({
      ...parsed.data,
      userId: user.id,
      ...(parsed.data.status === 'completed' ? { completedAt: new Date() } : {}),
    });

    return NextResponse.json({ task: taskResponse(task) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to create this task right now.' } }, { status: 500 });
  }
}

export { taskResponse };