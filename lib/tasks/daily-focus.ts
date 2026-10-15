export type DailyFocusTask = {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
};

export const dailyFocusEmptyMessage = 'No pending tasks. Add a task to get started.';

const priorityOrder: Record<DailyFocusTask['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function getDailyFocusView(tasks: DailyFocusTask[]) {
  const topTasks = tasks
    .filter((task) => task.status !== 'completed')
    .slice()
    .sort((left, right) => {
      const priorityDifference = priorityOrder[left.priority] - priorityOrder[right.priority];
      if (priorityDifference !== 0) return priorityDifference;

      if (left.dueDate === null && right.dueDate !== null) return 1;
      if (left.dueDate !== null && right.dueDate === null) return -1;
      if (left.dueDate !== null && right.dueDate !== null) return left.dueDate.localeCompare(right.dueDate);
      return 0;
    })
    .slice(0, 3);

  return {
    tasks: topTasks,
    emptyMessage: topTasks.length === 0 ? dailyFocusEmptyMessage : null,
  };
}