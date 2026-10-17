import { NextResponse } from 'next/server';
import { AIConfigurationError, AIProviderAPIError, AIProviderTimeoutError, AIResponseError, mapAIProviderError, recommendTaskPriorities } from '@/lib/ai/task-prioritization';
import { getCurrentUser } from '@/lib/auth/session';
import { MAX_JSON_REQUEST_BYTES, parseJsonRequest } from '@/lib/http/parse-json-request';
import { recommendTaskPriority } from '@/lib/tasks/priority-recommendation';
import TaskModel from '@/models/Task';
import { taskPrioritizationInputSchema } from '@/lib/validations/task-prioritization';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
  }

  const body = await parseJsonRequest(request, MAX_JSON_REQUEST_BYTES);
  if (!body.success && body.reason === 'too_large') {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Request body must be 32 KiB or smaller.' } }, { status: 413 });
  }
  if (!body.success) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON.' } }, { status: 400 });
  }

  const parsed = taskPrioritizationInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Task IDs are invalid.' } }, { status: 400 });
  }

  try {
    const tasks = await TaskModel.find({ _id: { $in: parsed.data.taskIds }, userId: user.id })
      .select('_id priority dueDate status')
      .lean();

    if (tasks.length !== parsed.data.taskIds.length) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'One or more tasks were not found.' } }, { status: 404 });
    }

    const taskInputs = tasks.map((task) => ({
      taskId: String(task._id),
      priority: task.priority,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null,
      status: task.status,
    }));
    const baseline = taskInputs.map((task) => ({
      taskId: task.taskId,
      ...recommendTaskPriority(task),
    }));
    const recommendations = parsed.data.includeLLM ? await recommendTaskPriorities(taskInputs) : [];
    return NextResponse.json({ baseline, recommendations });
  } catch (error) {
    if (error instanceof AIConfigurationError) {
      return NextResponse.json({ error: { code: 'AI_NOT_CONFIGURED', message: error.message } }, { status: 503 });
    }
    if (error instanceof AIProviderTimeoutError) {
      return NextResponse.json({ error: { code: 'AI_TIMEOUT', message: error.message } }, { status: 504 });
    }
    if (error instanceof AIProviderAPIError) {
      const mapped = mapAIProviderError(error);
      return NextResponse.json({ error: { code: mapped.code, message: mapped.message } }, { status: mapped.status });
    }
    if (error instanceof AIResponseError) {
      return NextResponse.json({ error: { code: 'AI_PROVIDER_ERROR', message: error.message } }, { status: 502 });
    }

    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to prioritize tasks right now.' } }, { status: 500 });
  }
}
