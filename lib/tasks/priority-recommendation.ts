import type { TaskPriority, TaskStatus } from '@/models/Task';

export type PriorityInput = {
  priority: TaskPriority;
  dueDate?: Date | string | null;
  status?: TaskStatus;
};

export type PriorityRecommendation = {
  priority: TaskPriority;
  explanation: string;
  score: number;
};

const importanceScore: Record<TaskPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const priorityForScore = (score: number): TaskPriority => {
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
};

export function recommendTaskPriority(task: PriorityInput, referenceDate = new Date()): PriorityRecommendation {
  if (task.status === 'completed') {
    return {
      priority: task.priority,
      explanation: 'Task is completed; its user-selected priority is unchanged.',
      score: importanceScore[task.priority],
    };
  }

  let deadlineScore = 0;
  let deadlineExplanation = '';
  if (task.dueDate) {
    const dueDate = new Date(task.dueDate);
    if (!Number.isNaN(dueDate.valueOf())) {
      dueDate.setUTCHours(0, 0, 0, 0);
      const reference = new Date(referenceDate);
      reference.setUTCHours(0, 0, 0, 0);
      const daysUntilDue = Math.floor((dueDate.valueOf() - reference.valueOf()) / 86_400_000);

      if (daysUntilDue < 0) {
        deadlineScore = 3;
        deadlineExplanation = 'The deadline has passed.';
      } else if (daysUntilDue <= 1) {
        deadlineScore = 3;
        deadlineExplanation = 'The deadline is today or tomorrow.';
      } else if (daysUntilDue <= 3) {
        deadlineScore = 2;
        deadlineExplanation = 'The deadline is within three days.';
      } else if (daysUntilDue <= 7) {
        deadlineScore = 1;
        deadlineExplanation = 'The deadline is within seven days.';
      }
    }
  }

  const score = importanceScore[task.priority] + deadlineScore;
  const priority = priorityForScore(score);
  const explanation = deadlineExplanation
    ? `Priority ${priority}: ${deadlineExplanation} Existing user-selected priority: ${task.priority}.`
    : `Priority ${priority}: based on the existing user-selected priority (${task.priority}); no near deadline is recorded.`;

  return { priority, explanation, score };
}
