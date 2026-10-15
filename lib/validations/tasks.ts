import { z } from 'zod';

const taskStatusSchema = z.enum(['todo', 'in_progress', 'completed']);
const taskPrioritySchema = z.enum(['low', 'medium', 'high']);
const sourceSchema = z.enum(['manual', 'ai']);

const dateSchema = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Enter a valid date.',
}).transform((value) => new Date(value));

const subtaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
}).strict();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200, 'Title is too long.'),
  description: z.string().trim().max(2000, 'Description is too long.').optional(),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default('medium'),
  category: z.string().trim().min(1).max(64).default('personal'),
  dueDate: z.union([dateSchema, z.null()]).optional(),
  source: sourceSchema.default('manual'),
  subtasks: z.array(subtaskSchema).max(100).default([]),
}).strict();

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200, 'Title is too long.').optional(),
  description: z.string().trim().max(2000, 'Description is too long.').optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  category: z.string().trim().min(1).max(64).optional(),
  dueDate: z.union([dateSchema, z.null()]).optional(),
  subtasks: z.array(subtaskSchema).max(100).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'Provide at least one field to update.',
});

const integerQuerySchema = (defaultValue: number, maximum?: number) => z
  .string()
  .regex(/^\d+$/)
  .optional()
  .transform((value) => Number(value ?? defaultValue))
  .pipe(z.number().int().min(1).max(maximum ?? Number.MAX_SAFE_INTEGER));

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  category: z.string().trim().min(1).max(64).optional(),
  dueBefore: dateSchema.optional(),
  dueAfter: dateSchema.optional(),
  page: integerQuerySchema(1),
  limit: integerQuerySchema(20, 100),
}).strict().refine((data) => !data.dueBefore || !data.dueAfter || data.dueAfter <= data.dueBefore, {
  path: ['dueAfter'],
  message: 'dueAfter must be before dueBefore.',
});

export const taskIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Task ID is invalid.');