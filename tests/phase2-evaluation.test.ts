/// <reference types="vitest/globals" />

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDailyPlan, type PlannerTask } from '@/lib/planning/daily-planner';
import { weeklyReportFallback, type WeeklyReportFacts } from '@/lib/reports/weekly-life-report';

type Dataset = {
  weeklyReportCases: Array<{
    id: string;
    facts: { completedInPeriod: number; openNow: number; overdueNow: number; journalEntriesInPeriod: number };
    expected: { wins: number; bottlenecks: number; hasRealisticSuggestion: boolean };
  }>;
  dailyPlannerCases: Array<{
    id: string;
    input: { planDate: string; startTime: string; availableMinutes: number; breakMinutes: number; timezone: string };
    tasks: PlannerTask[];
    expected: {
      scheduledTaskIds: string[];
      workMinutes: number;
      breakMinutes: number;
      overdueCount: number;
      dueTodayCount: number;
      notScheduledIds: string[];
      deadlineConflictIds?: string[];
      assumedDuration?: boolean;
      breakCount?: number;
    };
  }>;
};

const dataset = JSON.parse(readFileSync(
  path.join(process.cwd(), 'data', 'evaluation', 'weekly-report-and-daily-planner-synthetic.json'),
  'utf8',
)) as Dataset;

function reportFacts(caseFacts: Dataset['weeklyReportCases'][number]['facts']): WeeklyReportFacts {
  return {
    period: { startDate: '2026-01-19', endDate: '2026-01-25', complete: true, timezone: 'UTC' },
    generatedAt: '2026-01-26T00:00:00.000Z',
    tasks: {
      completedInPeriod: caseFacts.completedInPeriod,
      openNow: caseFacts.openNow,
      overdueNow: caseFacts.overdueNow,
      priorityCountsNow: { low: 0, medium: 0, high: 0 },
      completionsByDay: [],
    },
    journal: { entriesInPeriod: caseFacts.journalEntriesInPeriod, entriesByDay: [] },
    mood: null,
  };
}

describe('synthetic Phase 2 evaluation', () => {
  it.each(dataset.weeklyReportCases)('keeps weekly report interpretations grounded: $id', ({ facts, expected }) => {
    const interpretation = weeklyReportFallback(reportFacts(facts));
    expect(interpretation.wins).toHaveLength(expected.wins);
    expect(interpretation.bottlenecks).toHaveLength(expected.bottlenecks);
    expect(interpretation.suggestions).toContain("Keep next week's plan realistic and leave room for breaks.");
    expect(interpretation.source).toBe('rules_fallback');
  });

  it.each(dataset.dailyPlannerCases)('produces a feasible daily schedule: $id', ({ input, tasks, expected }) => {
    const plan = buildDailyPlan(tasks, input);
    const uniqueScheduledIds = [...new Set(plan.schedule.flatMap((item) => item.kind === 'task' ? [item.taskId] : []))];
    const scheduledWork = plan.schedule
      .filter((item) => item.kind === 'task')
      .reduce((total, item) => total + item.durationMinutes, 0);
    const scheduledBreaks = plan.schedule
      .filter((item) => item.kind === 'break')
      .reduce((total, item) => total + item.durationMinutes, 0);
    const usedMinutes = plan.schedule.reduce((total, item) => total + item.durationMinutes, 0);
    const startMinutes = Number(input.startTime.slice(0, 2)) * 60 + Number(input.startTime.slice(3));
    let previousEnd = startMinutes;

    expect(plan.scheduledTaskIds).toEqual(expected.scheduledTaskIds);
    expect(plan.scheduledWorkMinutes).toBe(expected.workMinutes);
    expect(plan.scheduledBreakMinutes).toBe(expected.breakMinutes);
    expect(plan.overdueCount).toBe(expected.overdueCount);
    expect(plan.dueTodayCount).toBe(expected.dueTodayCount);
    expect(plan.notScheduled.map(({ taskId }) => taskId)).toEqual(expected.notScheduledIds);
    if (expected.deadlineConflictIds) {
      expect(plan.deadlineConflicts.map(({ taskId }) => taskId)).toEqual(expected.deadlineConflictIds);
    }
    expect(uniqueScheduledIds).toHaveLength(plan.scheduledTaskIds.length);
    expect(scheduledWork + scheduledBreaks).toBe(usedMinutes);
    expect(usedMinutes).toBeLessThanOrEqual(plan.availableMinutes);
    for (const item of plan.schedule) {
      const itemStart = Number(item.startTime.slice(0, 2)) * 60 + Number(item.startTime.slice(3));
      const itemEnd = Number(item.endTime.slice(0, 2)) * 60 + Number(item.endTime.slice(3));
      expect(itemStart).toBeGreaterThanOrEqual(previousEnd);
      expect(itemEnd - itemStart).toBe(item.durationMinutes);
      expect(itemEnd).toBeLessThanOrEqual(startMinutes + plan.availableMinutes);
      previousEnd = itemEnd;
    }
    if (expected.assumedDuration) {
      expect(plan.schedule.some((item) => item.kind === 'task' && item.durationAssumed)).toBe(true);
    }
    if (expected.breakCount !== undefined) {
      expect(plan.schedule.filter((item) => item.kind === 'break')).toHaveLength(expected.breakCount);
    }
  });
});
