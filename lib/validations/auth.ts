import { z } from 'zod';
import { normalizeEmail } from '@/lib/auth/password';

const passwordSchema = z
  .string()
  .trim()
  .min(8, 'Password must be at least 8 characters long.')
  .max(128, 'Password is too long.')
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: 'Password must include both letters and numbers.',
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters long.').max(80, 'Name is too long.'),
    email: z
      .string()
      .trim()
      .email('Enter a valid email address.')
      .transform((value) => normalizeEmail(value)),
    password: passwordSchema,
    confirmPassword: z.string().trim().min(8),
    timezone: z.string().trim().min(2).max(64).default('UTC'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .transform((value) => normalizeEmail(value)),
  password: z.string().trim().min(1, 'Password is required.'),
});

export const safeRedirectSchema = z.string().trim().refine((value) => {
  if (!value || value === '/') return true;
  return /^\/(?!\/)[A-Za-z0-9/_\-.]*$/.test(value);
}, 'Redirect target is invalid.');
