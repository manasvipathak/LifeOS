import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/register-form';
import { getAuthSession } from '@/lib/auth/session';

export default async function RegisterPage() {
  const session = await getAuthSession();

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="container-shell py-16">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-soft">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Start fresh</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Create account</h1>
        </div>

        <RegisterForm />

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-700">Log in</Link>
        </p>
      </div>
    </main>
  );
}
