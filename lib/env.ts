import { z } from 'zod';

const envSchema = z.object({
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters long.'),
  AUTH_URL: z.string().url('AUTH_URL must be a valid URL.'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required when connecting to MongoDB.'),
  MONGODB_DB_NAME: z.string().min(1, 'MONGODB_DB_NAME is required.'),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL.'),
  AI_PROVIDER: z.enum(['openai', 'google']).optional(),
  AI_MODEL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
});

export function getEnv() {
  return envSchema.parse(process.env);
}

export function getMongoEnv() {
  return {
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
  };
}
