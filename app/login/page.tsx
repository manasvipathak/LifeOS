import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getAuthSession } from '@/lib/auth/session';

export default async function LoginPage() {
  const session = await getAuthSession();

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="container-shell py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-soft">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Welcome back</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Log in</h1>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-sm text-slate-600">
          Need an account?{' '}
          <Link href="/register" className="font-semibold text-brand-700">Create one</Link>
        </p>
      </div>
    </main>
  );
}
