import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AIConfigurationError, AIProviderAPIError, AIResponseError, extractTaskProposals, mapAIProviderError } from '@/lib/ai/task-extraction';
import { taskExtractionInputSchema } from '@/lib/validations/task-extraction';

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON.' } }, { status: 400 });
  }

  const parsed = taskExtractionInputSchema.safeParse(body);
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

    if (error instanceof AIProviderAPIError) {
      const mapped = mapAIProviderError(error);
      console.error('[ai-task-extraction] AI provider request failed', {
        provider: error.provider,
        model: error.model,
        status: error.status,
        code: error.code,
        type: error.type,
        message: error.providerMessage,
        cause: {
          status: error.status,
          code: error.code,
          type: error.type,
          message: error.providerMessage,
        },
      });

      return NextResponse.json({ error: { code: mapped.code, message: mapped.message } }, { status: mapped.status });
    }

    if (error instanceof AIResponseError) {
      return NextResponse.json({ error: { code: 'AI_PROVIDER_ERROR', message: error.message } }, { status: 502 });
    }

    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to extract task proposals right now.' } }, { status: 500 });
  }
}