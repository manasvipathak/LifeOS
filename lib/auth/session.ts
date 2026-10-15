import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import UserModel from '@/models/User';
import connectMongo from '@/lib/db/connect';
import { normalizeEmail } from '@/lib/auth/password';
import { authOptions } from '@/lib/auth';

export function isSafeRedirect(target: string | undefined, fallback = '/dashboard'): string {
  if (!target) return fallback;
  if (target === '/') return fallback;
  return /^\/(?!\/)[A-Za-z0-9/_\-.]*$/.test(target) ? target : fallback;
}

export async function getAuthSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getAuthSession();

  if (!session?.user?.email) {
    return null;
  }

  await connectMongo();
  const normalizedEmail = normalizeEmail(session.user.email);
  const user = await UserModel.findOne({ email: normalizedEmail }).select('-passwordHash').lean();

  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    timezone: user.timezone ?? 'UTC',
  };
}

export async function requireAuth() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect('/login');
  }

  return session;
}
