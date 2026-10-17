'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { BarChart3, CalendarCheck2, CalendarDays, Heart, LayoutDashboard, ListTodo, LogOut, NotebookPen, Settings, Sparkles, UserCircle2 } from 'lucide-react';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/dashboard/journal', label: 'Journal', icon: NotebookPen },
  { href: '/dashboard/mood', label: 'Mood Tracking', icon: Heart },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/weekly-report', label: 'Weekly AI Report', icon: Sparkles },
  { href: '/dashboard/daily-planner', label: 'Daily Planner', icon: CalendarCheck2 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function DashboardShell({
  user,
  title,
  description,
  children,
}: {
  user: { name?: string | null; email?: string | null; timezone?: string | null };
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="dashboard-theme min-h-screen bg-slate-100">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-200 bg-slate-950 text-slate-100 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">L</div>
              <div>
                <div className="text-lg font-bold">LifeOS</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Focus system</div>
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-2 px-4 py-4" aria-label="Sidebar navigation">
            {navigation.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1">
          <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
            <div className="container-shell flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-700">Workspace</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <UserCircle2 className="h-4 w-4 text-brand-700" />
                  <span>{user.name ?? user.email ?? 'User'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </header>

          <main className="container-shell py-8">
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <p className="text-sm text-slate-500">{description}</p>
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
