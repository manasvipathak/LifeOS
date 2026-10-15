/// <reference types="vitest/globals" />

import { dailyFocusEmptyMessage, getDailyFocusView, type DailyFocusTask } from '@/lib/tasks/daily-focus';

function task(
  id: string,
  priority: DailyFocusTask['priority'],
  dueDate: string | null,
  status: DailyFocusTask['status'] = 'todo',
): DailyFocusTask {
  return { id, title: `Task ${id}`, priority, dueDate, status };
}

describe('daily focus ranking', () => {
  it('ranks priority before due date and orders undated tasks last within priority', () => {
    const result = getDailyFocusView([
      task('medium-sooner', 'medium', '2026-10-17'),
      task('high-no-date', 'high', null),
      task('high-later', 'high', '2026-10-20'),
      task('high-sooner', 'high', '2026-10-18'),
      task('low-earliest', 'low', '2026-10-16'),
    ]);

    expect(result.tasks.map(({ id }) => id)).toEqual(['high-sooner', 'high-later', 'high-no-date']);
    expect(result.emptyMessage).toBeNull();
  });

  it('shows the empty state when there are no pending tasks', () => {
    expect(getDailyFocusView([])).toEqual({ tasks: [], emptyMessage: dailyFocusEmptyMessage });
  });

  it('excludes completed tasks and returns no more than three', () => {
    const result = getDailyFocusView([
      task('done-high', 'high', '2026-10-16', 'completed'),
      task('high-1', 'high', '2026-10-17'),
      task('high-2', 'high', '2026-10-18'),
      task('high-3', 'high', '2026-10-19'),
      task('high-4', 'high', '2026-10-20'),
    ]);

    expect(result.tasks.map(({ id }) => id)).toEqual(['high-1', 'high-2', 'high-3']);
  });
});