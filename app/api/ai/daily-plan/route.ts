import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AIConfigurationError, AIProviderAPIError, AIProviderTimeoutError, AIResponseError } from '@/lib/ai/task-extraction';
import { MAX_JSON_REQUEST_BYTES, parseJsonRequest } from '@/lib/http/parse-json-request';
import { buildDailyPlan, generatePlannerInterpretation, plannerDisabled, plannerFallback, plannerFallbackReason, plannerNotNeeded } from '@/lib/planning/daily-planner';
import TaskModel from '@/models/Task';
import { dailyPlannerInputSchema } from '@/lib/validations/daily-planner';

const maximumTasks = 100;

function localDate(timezone: string): string {
  let safeTimezone = 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    safeTimezone = timezone;
  } catch {
    // An invalid saved timezone must not prevent planning.
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function availableTasksQuery(userId: string) {
  return TaskModel.find({ userId, status: { $in: ['todo', 'in_progress'] } })
    .select('_id title priority status dueDate createdAt')
    .sort({ dueDate: 1, priority: -1, createdAt: 1 })
    .limit(maximumTasks + 1)
    .lean();
}

function mapTask(task: {
  _id: unknown;
  title: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress';
  dueDate?: Date | null;
  createdAt: Date;
}) {
  return {
    taskId: String(task._id),
    title: task.title,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null,
    createdAt: new Date(task.createdAt).toISOString(),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
  }

  try {
    const result = await availableTasksQuery(user.id);
    const tasks = result.slice(0, maximumTasks).map(mapTask);
    return NextResponse.json({
      tasks,
      taskLimitHit: result.length > maximumTasks,
      timezone: user.timezone ?? 'UTC',
      today: localDate(user.timezone ?? 'UTC'),
    });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to load tasks for planning right now.' } }, { status: 500 });
  }
}

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

  const parsed = dailyPlannerInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Planning input is invalid.' } }, { status: 400 });
  }

  try {
    const records = await availableTasksQuery(user.id);
    const tasks = records.slice(0, maximumTasks).map(mapTask);
    const durations = new Map(parsed.data.taskDurations.map(({ taskId, minutes }) => [taskId, minutes]));
    const availableIds = new Set(tasks.map(({ taskId }) => taskId));

    if ([...durations.keys()].some((taskId) => !availableIds.has(taskId))) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Durations must refer to your currently available tasks.' } }, { status: 400 });
    }

    const plannerTasks = tasks.map((task) => ({
      ...task,
      durationMinutes: durations.get(task.taskId) ?? 30,
      durationAssumed: !durations.has(task.taskId),
    }));
    const plan = buildDailyPlan(plannerTasks, {
      planDate: parsed.data.planDate,
      startTime: parsed.data.startTime,
      availableMinutes: parsed.data.availableMinutes,
      breakMinutes: parsed.data.breakMinutes,
      timezone: user.timezone ?? 'UTC',
    });

    let interpretation = parsed.data.includeAI
      ? (tasks.length > 0 ? plannerFallback(plan) : plannerNotNeeded(plan))
      : plannerDisabled(plan);
    if (parsed.data.includeAI && tasks.length > 0) {
      try {
        interpretation = await generatePlannerInterpretation(plan);
      } catch (error) {
        if (!(error instanceof AIConfigurationError || error instanceof AIProviderAPIError ||
          error instanceof AIProviderTimeoutError || error instanceof AIResponseError)) {
          throw error;
        }
        interpretation = plannerFallback(plan, plannerFallbackReason(error));
      }
    }

    return NextResponse.json({ plan: { ...plan, taskLimitHit: records.length > maximumTasks }, interpretation });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to create a daily plan right now.' } }, { status: 500 });
  }
}
