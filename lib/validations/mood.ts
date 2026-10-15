import { z } from 'zod';
import { moodValues } from '@/lib/mood/constants';

export const createMoodEntrySchema = z.object({
  mood: z.enum(moodValues),
  note: z.string().trim().max(280, 'Note must be 280 characters or fewer.').optional().transform((value) => value || undefined),
}).strict();

export const moodHistoryQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().transform((value) => Number(value ?? 20)).pipe(z.number().int().min(1).max(50)),
}).strict();