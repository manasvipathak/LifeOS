import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AIConfigurationError, AIProviderAPIError, AIProviderTimeoutError, AIResponseError, extractTaskProposals, mapAIProviderError } from '@/lib/ai/task-extraction';
import { taskExtractionInputSchema } from '@/lib/validations/task-extraction';
import { MAX_JSON_REQUEST_BYTES, parseJsonRequest } from '@/lib/http/parse-json-request';

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

  const parsed = taskExtractionInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Task description is invalid.' } }, { status: 400 });
  }

  try {
    const proposals = await extractTaskProposals(parsed.data.text, user.timezone ?? 'UTC');
    return NextResponse.json({ proposals });
  } catch (error) {
    if (error instanceof AIConfigurationError) {
      return NextResponse.json({ error: { code: 'AI_NOT_CONFIGURED', message: error.message } }, { status: 503 });
    }

    if (error instanceof AIProviderTimeoutError) {
      return NextResponse.json({ error: { code: 'AI_TIMEOUT', message: error.message } }, { status: 504 });
    }

    if (error instanceof AIProviderAPIError) {
      const mapped = mapAIProviderError(error);
      return NextResponse.json({ error: { code: mapped.code, message: mapped.message } }, { status: mapped.status });
    }

    if (error instanceof AIResponseError) {
      return NextResponse.json({ error: { code: 'AI_PROVIDER_ERROR', message: error.message } }, { status: 502 });
    }

    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to extract task proposals right now.' } }, { status: 500 });
  }
}