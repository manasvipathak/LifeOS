import { z } from 'zod';

export const taskExtractionInputSchema = z.object({
  text: z.string().trim().min(1, 'Describe at least one task.').max(6000, 'Description must be 6,000 characters or fewer.'),
}).strict();

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Due date must be a real calendar date.');

export const extractedTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: dateOnlySchema.nullable(),
}).strict();

export const extractedTasksSchema = z.object({
  tasks: z.array(extractedTaskSchema).max(20),
}).strict();

export type ExtractedTask = z.infer<typeof extractedTaskSchema>;