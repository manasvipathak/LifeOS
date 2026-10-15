import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'LifeOS',
  description: 'A calm, AI-assisted productivity workspace for your personal life.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
          <div className="container-shell flex items-center justify-between py-4">
            <Link href="/" className="flex items-center gap-3" aria-label="LifeOS home">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
                L
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight text-slate-900">LifeOS</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Focus system</div>
              </div>
            </Link>

            <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
              <Link href="/" className="transition hover:text-slate-900">Overview</Link>
              <Link href="/login" className="transition hover:text-slate-900">Login</Link>
              <Link href="/register" className="transition hover:text-slate-900">Register</Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link href="/login" className="btn-secondary hidden sm:inline-flex">Log in</Link>
              <Link href="/register" className="btn-primary">Get started</Link>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
