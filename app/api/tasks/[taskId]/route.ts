import { NextResponse } from 'next/server';
import TaskModel from '@/models/Task';
import { getCurrentUser } from '@/lib/auth/session';
import { taskIdSchema, updateTaskSchema } from '@/lib/validations/tasks';
import { taskResponse } from '../route';

type RouteContext = { params: Promise<{ taskId: string }> };

async function getOwnedTaskFilter(context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return { response: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 }) };
  }

  const { taskId } = await context.params;
  const parsedId = taskIdSchema.safeParse(taskId);

  if (!parsedId.success) {
    return { response: NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Task ID is invalid.' } }, { status: 400 }) };
  }

  return { filter: { _id: parsedId.data, userId: user.id } };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const result = await getOwnedTaskFilter(context);
    if (result.response) return result.response;

    const task = await TaskModel.findOne(result.filter).lean();
    if (!task) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Task was not found.' } }, { status: 404 });
    }

    return NextResponse.json({ task: taskResponse(task) });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to load this task right now.' } }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON.' } }, { status: 400 });
  }

  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Task update is invalid.' } }, { status: 400 });
  }

  try {
    const result = await getOwnedTaskFilter(context);
    if (result.response) return result.response;

    const update: { $set: Record<string, unknown>; $unset?: Record<string, 1> } = { $set: { ...parsed.data } };

    if (parsed.data.status === 'completed') {
      update.$set.completedAt = new Date();
    } else if (parsed.data.status) {
      update.$unset = { completedAt: 1 };
    }

    const task = await TaskModel.findOneAndUpdate(result.filter, update, { new: true, runValidators: true }).lean();
    if (!task) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Task was not found.' } }, { status: 404 });
    }

    return NextResponse.json({ task: taskResponse(task) });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to update this task right now.' } }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const result = await getOwnedTaskFilter(context);
    if (result.response) return result.response;

    const task = await TaskModel.findOneAndDelete(result.filter);
    if (!task) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Task was not found.' } }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to delete this task right now.' } }, { status: 500 });
  }
}