import { z } from 'zod';

const taskIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Task ID is invalid.');
const prioritySchema = z.enum(['low', 'medium', 'high']);

export const taskPrioritizationInputSchema = z.object({
  taskIds: z.array(taskIdSchema).min(1).max(50),
  includeLLM: z.boolean().optional().default(false),
}).strict().refine((value) => new Set(value.taskIds).size === value.taskIds.length, {
  path: ['taskIds'],
  message: 'Task IDs must be unique.',
});

export const taskPriorityRecommendationsSchema = z.object({
  recommendations: z.array(z.object({
    taskId: taskIdSchema,
    priority: prioritySchema,
    explanation: z.string().trim().min(1).max(300),
  }).strict()).max(50),
}).strict();

export type TaskPriorityRecommendation = z.infer<typeof taskPriorityRecommendationsSchema>['recommendations'][number];
