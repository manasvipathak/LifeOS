/// <reference types="vitest/globals" />

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WeeklyReportPage from '@/app/(dashboard)/dashboard/weekly-report/page';
import DailyPlannerPage from '@/app/(dashboard)/dashboard/daily-planner/page';

describe('Phase 2 dashboard pages', () => {
  it('renders the weekly report route with reporting-period controls', () => {
    const markup = renderToStaticMarkup(createElement(WeeklyReportPage));

    expect(markup).toContain('Weekly AI life report');
    expect(markup).toContain('Week starting Monday');
    expect(markup).toContain('Generate report');
    expect(markup).not.toMatch(/coming soon/i);
  });

  it('renders the daily planner route with its actual loading and review-only UI', () => {
    const markup = renderToStaticMarkup(createElement(DailyPlannerPage));

    expect(markup).toContain('AI-assisted daily planner');
    expect(markup).toContain('review-only proposal');
    expect(markup).toContain('Available from');
    expect(markup).toContain('Estimated task durations');
    expect(markup).toContain('Build review-only plan');
    expect(markup).not.toMatch(/coming soon/i);
  });

});
