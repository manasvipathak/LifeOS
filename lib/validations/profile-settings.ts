import { z } from 'zod';

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const profileSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long.').max(80, 'Name must be 80 characters or fewer.'),
  timezone: z.string().trim().min(1, 'Choose a valid timezone.').max(64).refine(isIanaTimezone, 'Enter a valid IANA timezone, such as America/Los_Angeles.'),
}).strict();

export type ProfileSettings = z.infer<typeof profileSettingsSchema>;
