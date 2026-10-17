/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadWeeklyReportFacts: vi.fn(),
  generateWeeklyInterpretation: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/reports/weekly-life-report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reports/weekly-life-report')>();
  return {
    ...actual,
    loadWeeklyReportFacts: mocks.loadWeeklyReportFacts,
    generateWeeklyInterpretation: mocks.generateWeeklyInterpretation,
  };
});

import { POST } from '@/app/api/ai/weekly-report/route';
import { AIConfigurationError } from '@/lib/ai/task-extraction';

const user = { id: '64b000000000000000000099', name: 'Ava', email: 'ava@example.com', timezone: 'UTC' };
const monday = new Date();
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const validWeekStart = monday.toISOString().slice(0, 10);
const facts = {
  period: { startDate: '2026-01-19', endDate: '2026-01-25', complete: true, timezone: 'UTC' as const },
  generatedAt: '2026-01-26T00:00:00.000Z',
  tasks: {
    completedInPeriod: 2,
    openNow: 1,
    overdueNow: 0,
    priorityCountsNow: { low: 0, medium: 1, high: 2 },
    completionsByDay: [],
  },
  journal: { entriesInPeriod: 1, entriesByDay: [] },
  mood: null,
};

function request(body: unknown) {
  return new Request('http://localhost/api/ai/weekly-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.loadWeeklyReportFacts.mockResolvedValue(facts);
  mocks.generateWeeklyInterpretation.mockResolvedValue({
    source: 'ai_guided',
    wins: ['You completed 2 tasks during this reporting period.'],
    bottlenecks: [],
    suggestions: ['Choose a small number of open tasks to focus on first.'],
  });
});

describe('POST /api/ai/weekly-report', () => {
  it('requires authentication before reading private aggregates', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(request({ weekStart: validWeekStart }));

    expect(response.status).toBe(401);
    expect(mocks.loadWeeklyReportFacts).not.toHaveBeenCalled();
  });

  it('validates a Monday week start and rejects client-supplied ownership fields', async () => {
    const nextDay = new Date(`${validWeekStart}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const invalidWeek = await POST(request({ weekStart: nextDay.toISOString().slice(0, 10) }));
    const extraOwner = await POST(request({ weekStart: validWeekStart, userId: '64b000000000000000000001' }));

    expect(invalidWeek.status).toBe(400);
    expect(extraOwner.status).toBe(400);
    expect(mocks.loadWeeklyReportFacts).not.toHaveBeenCalled();
  });

  it('returns only computed facts and grounded interpretation for the authenticated user', async () => {
    const response = await POST(request({ weekStart: validWeekStart }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadWeeklyReportFacts).toHaveBeenCalledWith(user.id, validWeekStart);
    expect(mocks.generateWeeklyInterpretation).toHaveBeenCalledWith(facts);
    expect(body.report.tasks.completedInPeriod).toBe(2);
    expect(body.report.interpretation.source).toBe('ai_guided');
  });

  it('returns a rules-based report when the provider is unavailable', async () => {
    mocks.generateWeeklyInterpretation.mockRejectedValue(new AIConfigurationError());

    const response = await POST(request({ weekStart: validWeekStart }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.interpretation.source).toBe('rules_fallback');
    expect(body.report.interpretation.fallbackReason).toBe('not_configured');
  });
});
