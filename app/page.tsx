import Link from 'next/link';

const featureCards = [
  {
    title: 'AI task extraction',
    description: 'Turn a rough sentence into structured tasks with review before they are saved.',
  },
  {
    title: 'Mood journaling',
    description: 'Capture how your day feels and keep AI summaries clearly labeled as approximate.',
  },
  {
    title: 'Productivity insights',
    description: 'Track completion rates, deadlines, categories, and habitual patterns over time.',
  },
];

const stats = [
  { label: 'Weekly tasks', value: '24' },
  { label: 'Completed', value: '18' },
  { label: 'Journal entries', value: '9' },
];

export default function HomePage() {
  return (
    <main>
      <section className="container-shell py-16 sm:py-20 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-6 inline-flex items-center rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
              Personal operating system
            </div>
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Manage life with less friction and more clarity.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              LifeOS brings your tasks, daily momentum, and emotional context into one calm workspace — with AI support that helps you act, review, and adjust without losing control.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/register" className="btn-primary">Create account</Link>
              <Link href="/login" className="btn-secondary">Sign in</Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-600">
              <span>Secure by design</span>
              <span>Private journaling</span>
              <span>AI-assisted planning</span>
            </div>
          </div>

          <div className="card-surface p-6 sm:p-8">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">This week</p>
                  <h2 className="mt-1 text-3xl font-bold text-slate-900">72%</h2>
                </div>
                <div className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700">
                  +12% momentum
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {[
                  { label: 'DBMS assignment', done: true, meta: 'Due today' },
                  { label: 'Interview prep', done: false, meta: 'Friday 6:00 PM' },
                  { label: 'Rahul call', done: false, meta: '8:00 PM' },
                ].map((task) => (
                  <div key={task.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${task.done ? 'bg-emerald-500' : 'bg-brand-500'}`} />
                      <div>
                        <p className="font-medium text-slate-800">{task.label}</p>
                        <p className="text-xs text-slate-500">{task.meta}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${task.done ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-50 text-brand-700'}`}>
                      {task.done ? 'Done' : 'Priority'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50/80">
        <div className="container-shell grid gap-6 py-10 md:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="card-surface p-5 text-center">
              <div className="text-3xl font-black text-slate-900">{stat.value}</div>
              <div className="mt-2 text-sm text-slate-600">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-shell py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Built for real routines</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Everything you need to stay on track.</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {featureCards.map((feature) => (
            <article key={feature.title} className="card-surface p-6">
              <div className="mb-4 h-11 w-11 rounded-xl bg-brand-100 flex items-center justify-center text-lg font-bold text-brand-700">✦</div>
              <h3 className="text-xl font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
