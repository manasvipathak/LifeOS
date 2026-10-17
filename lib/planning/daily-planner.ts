import {
  AIConfigurationError,
  AIProviderAPIError,
  AIProviderTimeoutError,
  AIResponseError,
  mapAIProviderError,
} from '@/lib/ai/task-extraction';
import { generateStructuredOutput } from '@/lib/ai/structured-output';
import type { TaskPriority, TaskStatus } from '@/models/Task';
import { dailyPlannerInsightsSchema, type DailyPlannerInsights } from '@/lib/validations/daily-planner';

export type PlannerTask = {
  taskId: string;
  title: string;
  priority: TaskPriority;
  status: Exclude<TaskStatus, 'completed'>;
  dueDate: string | null;
  createdAt: string;
  durationMinutes: number;
  durationAssumed: boolean;
};

export type DailyPlanInput = {
  planDate: string;
  startTime: string;
  availableMinutes: number;
  breakMinutes: number;
  timezone: string;
};

export type DailyScheduleItem =
  | {
    kind: 'task';
    taskId: string;
    title: string;
    priority: TaskPriority;
    dueDate: string | null;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    durationAssumed: boolean;
  }
  | {
    kind: 'break';
    startTime: string;
    endTime: string;
    durationMinutes: number;
  };

export type DailyPlan = {
  planDate: string;
  timezone: string;
  startTime: string;
  availableMinutes: number;
  scheduledWorkMinutes: number;
  scheduledBreakMinutes: number;
  unusedMinutes: number;
  overdueCount: number;
  dueTodayCount: number;
  deadlineConflicts: Array<{
    taskId: string;
    title: string;
    dueDate: string;
    reason: 'overdue' | 'due_today_not_scheduled';
  }>;
  schedule: DailyScheduleItem[];
  scheduledTaskIds: string[];
  notScheduled: Array<{
    taskId: string;
    title: string;
    priority: TaskPriority;
    dueDate: string | null;
    durationMinutes: number;
    durationAssumed: boolean;
  }>;
};

export type PlannerInterpretation = {
  source: 'ai_guided' | 'rules_fallback' | 'disabled' | 'not_needed';
  fallbackReason?: string;
  suggestions: string[];
};

const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const suggestionCopy: Record<DailyPlannerInsights['insightCodes'][number], string> = {
  start_with_due_soon: 'Start with work due today or tomorrow.',
  review_overdue_work: 'Review overdue work before taking on additional tasks.',
  keep_scheduled_breaks: 'Keep the scheduled breaks in the plan.',
  revisit_unscheduled_tasks: 'Review unscheduled work and choose a later time for what does not fit.',
};

function formatClock(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clockMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function orderedTasks(tasks: PlannerTask[], planDate: string): PlannerTask[] {
  return [...tasks].sort((left, right) => {
    const leftOverdue = left.dueDate !== null && left.dueDate < planDate;
    const rightOverdue = right.dueDate !== null && right.dueDate < planDate;
    if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
    if (left.dueDate !== right.dueDate) {
      if (left.dueDate === null) return 1;
      if (right.dueDate === null) return -1;
      if (left.dueDate !== right.dueDate) return left.dueDate.localeCompare(right.dueDate);
    }
    if (priorityRank[left.priority] !== priorityRank[right.priority]) {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }
    if (left.status !== right.status) return left.status === 'in_progress' ? -1 : 1;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function buildDailyPlan(tasks: PlannerTask[], input: DailyPlanInput): DailyPlan {
  const ordered = orderedTasks(tasks, input.planDate);
  const schedule: DailyScheduleItem[] = [];
  const notScheduled: DailyPlan['notScheduled'] = [];
  const scheduledTaskIds: string[] = [];
  const limit = clockMinutes(input.startTime) + input.availableMinutes;
  let cursor = clockMinutes(input.startTime);
  let focusedSinceBreak = 0;
  let scheduledWorkMinutes = 0;
  let scheduledBreakMinutes = 0;

  for (const task of ordered) {
    const candidate: DailyScheduleItem[] = [];
    let candidateCursor = cursor;
    let candidateFocus = focusedSinceBreak;
    let remainingWork = task.durationMinutes;
    let candidateBreakMinutes = 0;

    while (remainingWork > 0) {
      if (candidateFocus === 60) {
        candidate.push({
          kind: 'break',
          startTime: formatClock(candidateCursor),
          endTime: formatClock(candidateCursor + input.breakMinutes),
          durationMinutes: input.breakMinutes,
        });
        candidateCursor += input.breakMinutes;
        candidateBreakMinutes += input.breakMinutes;
        candidateFocus = 0;
      }

      const blockMinutes = Math.min(remainingWork, 60 - candidateFocus);
      candidate.push({
        kind: 'task',
        taskId: task.taskId,
        title: task.title,
        priority: task.priority,
        dueDate: task.dueDate,
        startTime: formatClock(candidateCursor),
        endTime: formatClock(candidateCursor + blockMinutes),
        durationMinutes: blockMinutes,
        durationAssumed: task.durationAssumed,
      });
      candidateCursor += blockMinutes;
      candidateFocus += blockMinutes;
      remainingWork -= blockMinutes;
    }

    if (candidateCursor > limit) {
      notScheduled.push({
        taskId: task.taskId,
        title: task.title,
        priority: task.priority,
        dueDate: task.dueDate,
        durationMinutes: task.durationMinutes,
        durationAssumed: task.durationAssumed,
      });
      continue;
    }

    schedule.push(...candidate);
    cursor = candidateCursor;
    focusedSinceBreak = candidateFocus;
    scheduledWorkMinutes += task.durationMinutes;
    scheduledBreakMinutes += candidateBreakMinutes;
    scheduledTaskIds.push(task.taskId);
  }

  return {
    planDate: input.planDate,
    timezone: input.timezone,
    startTime: input.startTime,
    availableMinutes: input.availableMinutes,
    scheduledWorkMinutes,
    scheduledBreakMinutes,
    unusedMinutes: input.availableMinutes - scheduledWorkMinutes - scheduledBreakMinutes,
    overdueCount: tasks.filter((task) => task.dueDate !== null && task.dueDate < input.planDate).length,
    dueTodayCount: tasks.filter((task) => task.dueDate === input.planDate).length,
    deadlineConflicts: tasks.flatMap<DailyPlan['deadlineConflicts'][number]>((task) => {
      if (task.dueDate !== null && task.dueDate < input.planDate) {
        return [{ taskId: task.taskId, title: task.title, dueDate: task.dueDate, reason: 'overdue' as const }];
      }
      if (task.dueDate === input.planDate && !scheduledTaskIds.includes(task.taskId)) {
        return [{ taskId: task.taskId, title: task.title, dueDate: task.dueDate, reason: 'due_today_not_scheduled' as const }];
      }
      return [];
    }),
    schedule,
    scheduledTaskIds,
    notScheduled,
  };
}

function eligibleInsightCodes(plan: DailyPlan): DailyPlannerInsights['insightCodes'] {
  return [
    ...(plan.dueTodayCount > 0 ? ['start_with_due_soon' as const] : []),
    ...(plan.overdueCount > 0 ? ['review_overdue_work' as const] : []),
    ...(plan.scheduledBreakMinutes > 0 ? ['keep_scheduled_breaks' as const] : []),
    ...(plan.notScheduled.length > 0 ? ['revisit_unscheduled_tasks' as const] : []),
  ];
}

function fallbackCodes(plan: DailyPlan): DailyPlannerInsights['insightCodes'] {
  const eligible = eligibleInsightCodes(plan);
  return eligible.length > 0 ? eligible : [];
}

function interpretationFromCodes(
  plan: DailyPlan,
  codes: DailyPlannerInsights['insightCodes'],
  source: PlannerInterpretation['source'],
  fallbackReason?: string,
): PlannerInterpretation {
  const allowed = new Set(eligibleInsightCodes(plan));
  const selected = [...new Set(codes)].filter((code) => allowed.has(code));
  const usedRules = source === 'ai_guided' && selected.length === 0;
  return {
    source: usedRules ? 'rules_fallback' : source,
    ...(fallbackReason || usedRules ? { fallbackReason: fallbackReason ?? 'no_supported_ai_themes' } : {}),
    suggestions: (selected.length > 0 ? selected : fallbackCodes(plan)).map((code) => suggestionCopy[code]),
  };
}

export function plannerFallback(plan: DailyPlan, fallbackReason?: string): PlannerInterpretation {
  return interpretationFromCodes(plan, fallbackCodes(plan), 'rules_fallback', fallbackReason);
}

export function plannerDisabled(plan: DailyPlan): PlannerInterpretation {
  return interpretationFromCodes(plan, fallbackCodes(plan), 'disabled');
}

export function plannerNotNeeded(plan: DailyPlan): PlannerInterpretation {
  return interpretationFromCodes(plan, fallbackCodes(plan), 'not_needed');
}

const providerSchema = {
  type: 'object',
  properties: {
    insightCodes: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: ['start_with_due_soon', 'review_overdue_work', 'keep_scheduled_breaks', 'revisit_unscheduled_tasks'] },
    },
  },
  required: ['insightCodes'],
  additionalProperties: false,
};

export async function generatePlannerInterpretation(plan: DailyPlan): Promise<PlannerInterpretation> {
  const eligibleCodes = eligibleInsightCodes(plan);
  const result = await generateStructuredOutput({
    operation: 'daily_planning',
    systemInstruction: 'Choose only insight codes supported by supplied counts and eligible codes. Do not make up task details. Return JSON only.',
    prompt: JSON.stringify({
      plan: {
        planDate: plan.planDate,
        availableMinutes: plan.availableMinutes,
        scheduledWorkMinutes: plan.scheduledWorkMinutes,
        scheduledBreakMinutes: plan.scheduledBreakMinutes,
        overdueCount: plan.overdueCount,
        dueTodayCount: plan.dueTodayCount,
        unscheduledCount: plan.notScheduled.length,
      },
      eligibleCodes,
    }),
    outputSchema: providerSchema,
    parse(value) {
      const parsed = dailyPlannerInsightsSchema.safeParse(value);
      if (!parsed.success) throw new AIResponseError('The AI provider returned invalid daily-planner insights.');
      return parsed.data;
    },
  });
  return interpretationFromCodes(plan, result.insightCodes, 'ai_guided');
}

export function plannerFallbackReason(error: unknown): string | undefined {
  if (error instanceof AIConfigurationError) return 'not_configured';
  if (error instanceof AIProviderTimeoutError) return 'timeout';
  if (error instanceof AIResponseError) return error.schemaValidationFailure ? 'invalid_output' : 'provider_unavailable';
  if (error instanceof AIProviderAPIError) return mapAIProviderError(error).code.toLowerCase();
  return undefined;
}
