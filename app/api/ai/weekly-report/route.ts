import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AIConfigurationError, AIProviderAPIError, AIProviderTimeoutError, AIResponseError } from '@/lib/ai/task-extraction';
import { MAX_JSON_REQUEST_BYTES, parseJsonRequest } from '@/lib/http/parse-json-request';
import {
  generateWeeklyInterpretation,
  loadWeeklyReportFacts,
  weeklyReportFallback,
  weeklyReportFallbackReason,
} from '@/lib/reports/weekly-life-report';
import { weeklyReportInputSchema } from '@/lib/validations/ai-life-report';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
  }

  const body = await parseJsonRequest(request, MAX_JSON_REQUEST_BYTES);
  if (!body.success && body.reason === 'too_large') {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Request body must be 32 KiB or smaller.' } }, { status: 413 });
  }
  if (!body.success) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON.' } }, { status: 400 });
  }

  const parsed = weeklyReportInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Reporting period is invalid.' } }, { status: 400 });
  }

  try {
    const facts = await loadWeeklyReportFacts(user.id, parsed.data.weekStart);
    const hasActivity = facts.tasks.completedInPeriod > 0 || facts.tasks.openNow > 0 ||
      facts.journal.entriesInPeriod > 0 || Object.values(facts.tasks.priorityCountsNow).some((count) => count > 0);
    let interpretation = weeklyReportFallback(facts);

    if (hasActivity) {
      try {
        interpretation = await generateWeeklyInterpretation(facts);
      } catch (error) {
        if (!(error instanceof AIConfigurationError || error instanceof AIProviderAPIError ||
          error instanceof AIProviderTimeoutError || error instanceof AIResponseError)) {
          throw error;
        }
        const fallbackReason = weeklyReportFallbackReason(error);
        interpretation = weeklyReportFallback(facts, fallbackReason);
      }
    }

    return NextResponse.json({ report: { ...facts, interpretation } });
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to build your weekly report right now.' } }, { status: 500 });
  }
}
