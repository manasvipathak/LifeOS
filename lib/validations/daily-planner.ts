import { z } from 'zod';

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const taskDurationSchema = z.object({
  taskId: z.string().regex(/^[a-f\d]{24}$/i, 'Task ID is invalid.'),
  minutes: z.number().int().min(10).max(240),
}).strict();

export const dailyPlannerInputSchema = z.object({
  planDate: z.string()
    .refine(isValidDate, 'Choose a valid planning date.')
    .refine((value) => {
      const day = new Date(`${value}T00:00:00.000Z`);
      const today = new Date();
      const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      return day.valueOf() >= utcToday - 86_400_000 && day.valueOf() <= utcToday + 14 * 86_400_000;
    }, 'Choose today or a date within the next 14 days.'),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Start time must use HH:MM.'),
  availableMinutes: z.number().int().min(30).max(720),
  breakMinutes: z.number().int().min(5).max(30).default(10),
  taskDurations: z.array(taskDurationSchema).max(100).default([]),
  includeAI: z.boolean().default(true),
}).strict().superRefine((value, context) => {
  const startMinutes = Number(value.startTime.slice(0, 2)) * 60 + Number(value.startTime.slice(3));
  if (startMinutes + value.availableMinutes > 24 * 60) {
    context.addIssue({
      code: 'custom',
      path: ['availableMinutes'],
      message: 'The available time window must end before midnight.',
    });
  }
  const taskIds = value.taskDurations.map(({ taskId }) => taskId);
  if (new Set(taskIds).size !== taskIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['taskDurations'],
      message: 'Provide at most one duration per task.',
    });
  }
});

export const dailyPlannerInsightsSchema = z.object({
  insightCodes: z.array(z.enum([
    'start_with_due_soon',
    'review_overdue_work',
    'keep_scheduled_breaks',
    'revisit_unscheduled_tasks',
  ])).max(4),
}).strict();

export type DailyPlannerInsights = z.infer<typeof dailyPlannerInsightsSchema>;
