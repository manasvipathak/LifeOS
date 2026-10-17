/// <reference types="vitest/globals" />

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function resolveExpectedDate(value: string, referenceDate: string): string | null {
  if (value === '$today') return referenceDate;
  const days = value === '$tomorrow' ? 1 : /^\$in_(\d+)_days$/.exec(value)?.[1];
  if (!days) return value;
  const date = new Date(`${referenceDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

describe('offline AI evaluation', () => {
  it('evaluates all synthetic cases deterministically from a supplied prediction file', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'lifeos-ai-evaluation-'));
    const predictionPath = path.join(directory, 'predictions.json');

    try {
      const dataset = JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'evaluation', 'task-extraction-synthetic.json'), 'utf8')) as {
        cases: Array<{ id: string; expectedStatus: number; expectedTasks: Array<{ title: string; priority: string; dueDate: string | null }> }>;
      };
      const priorityDataset = JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'evaluation', 'task-prioritization-synthetic.json'), 'utf8')) as {
        cases: Array<{ id: string; expectedPriority: string }>;
      };
      const predictions = {
        referenceDate: '2026-01-15',
        taskPredictions: dataset.cases.map((example) => ({
          id: example.id,
          status: example.expectedStatus,
          proposals: example.expectedStatus === 200
            ? example.expectedTasks.map((task) => ({ ...task, dueDate: task.dueDate === null ? null : resolveExpectedDate(task.dueDate, '2026-01-15') }))
            : null,
        })),
        priorityRecommendations: priorityDataset.cases.map((example) => ({
          id: example.id,
          priority: example.expectedPriority,
        })),
      };
      writeFileSync(predictionPath, JSON.stringify(predictions));

      const output = execFileSync(process.execPath, [
        path.join(process.cwd(), 'scripts', 'evaluate-ai.mjs'),
        '--predictions',
        predictionPath,
      ], { encoding: 'utf8' });
      const result = JSON.parse(output);

      expect(result.dataset).toEqual({ taskExtractionCases: 50, prioritizationCases: 50 });
      expect(result.taskExtraction.taskPrecision).toBe(1);
      expect(result.taskExtraction.taskRecall).toBe(1);
      expect(result.taskExtraction.dateExtractionAccuracy).toBe(1);
      expect(result.taskExtraction.schemaValidOutputRate).toBe(1);
      expect(result.taskExtraction.failureRate).toBe(0);
      expect(result.prioritization.llmRecommendations.accuracy).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
