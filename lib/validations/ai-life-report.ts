import { z } from 'zod';

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const weeklyReportInputSchema = z.object({
  weekStart: z.string().refine(isValidDate, 'Choose a valid week start date.').refine((value) => {
    const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
    return day === 1;
  }, 'The reporting period must start on a Monday.').refine((value) => {
    const start = new Date(`${value}T00:00:00.000Z`);
    const today = new Date(`${utcDate(new Date())}T00:00:00.000Z`);
    return start <= today && start >= new Date(today.valueOf() - 366 * 86_400_000);
  }, 'Choose a week that began within the last year.'),
}).strict();

export const weeklyReportInsightsSchema = z.object({
  insightCodes: z.array(z.enum([
    'celebrate_completed_tasks',
    'review_overdue_tasks',
    'focus_open_tasks',
    'keep_next_week_realistic',
  ])).max(4),
}).strict();

export type WeeklyReportInsights = z.infer<typeof weeklyReportInsightsSchema>;
