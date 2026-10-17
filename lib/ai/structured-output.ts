import {
  AIProviderAPIError,
  AIProviderTimeoutError,
  AIResponseError,
  assertAIConfiguration,
  type AIProviderAPIError as ProviderError,
} from '@/lib/ai/task-extraction';
import { recordAIOperation, type AIOperation, type AIProvider } from '@/lib/ai/metrics';

const openAiEndpoint = 'https://api.openai.com/v1/chat/completions';
const googleGenerateEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
const timeoutMs = 15_000;

type JsonSchema = Record<string, unknown>;

type StructuredOutputOptions<T> = {
  operation: Extract<AIOperation, 'weekly_report' | 'daily_planning'>;
  systemInstruction: string;
  prompt: string;
  outputSchema: JsonSchema;
  parse: (value: unknown) => T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function usageFrom(payload: Record<string, unknown>, provider: AIProvider) {
  if (provider === 'google' && isRecord(payload.usageMetadata)) {
    return {
      inputTokens: tokenCount(payload.usageMetadata.promptTokenCount),
      outputTokens: tokenCount(payload.usageMetadata.candidatesTokenCount),
    };
  }
  if (provider === 'openai' && isRecord(payload.usage)) {
    return {
      inputTokens: tokenCount(payload.usage.prompt_tokens),
      outputTokens: tokenCount(payload.usage.completion_tokens),
    };
  }
  return {};
}

function providerApiError(provider: AIProvider, status: number, payload: unknown, model: string): ProviderError {
  const root = isRecord(payload) ? payload : {};
  const details = isRecord(root.error) ? root.error : root;
  return new AIProviderAPIError(provider, {
    status,
    code: typeof details.code === 'string' ? details.code : null,
    type: typeof details.status === 'string' ? details.status : (typeof details.type === 'string' ? details.type : null),
    message: 'The AI provider rejected the structured-output request.',
  }, null, model);
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AIResponseError('The AI provider returned malformed structured output.');
  }
}

function contentFrom(payload: unknown, provider: AIProvider): { content: unknown; usage: ReturnType<typeof usageFrom> } {
  if (!isRecord(payload)) throw new AIResponseError('The AI provider returned malformed structured output.');
  const usage = usageFrom(payload, provider);
  if (provider === 'google') {
    const candidates = payload.candidates;
    if (!Array.isArray(candidates) || !isRecord(candidates[0]) ||
      !isRecord(candidates[0].content) || !Array.isArray(candidates[0].content.parts)) {
      throw new AIResponseError('The AI provider returned malformed structured output.');
    }
    const part = candidates[0].content.parts.find((candidate: unknown) => isRecord(candidate) && typeof candidate.text === 'string');
    return { content: isRecord(part) ? part.text : undefined, usage };
  }

  if (!Array.isArray(payload.choices) || !isRecord(payload.choices[0]) || !isRecord(payload.choices[0].message)) {
    throw new AIResponseError('The AI provider returned malformed structured output.');
  }
  return { content: payload.choices[0].message.content, usage };
}

function parseJsonContent(value: unknown): unknown {
  if (typeof value !== 'string') throw new AIResponseError('The AI provider returned malformed structured output.');
  try {
    return JSON.parse(value);
  } catch {
    throw new AIResponseError('The AI provider returned malformed structured output.');
  }
}

function isTimeout(error: unknown): boolean {
  return isRecord(error) && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export async function generateStructuredOutput<T>(options: StructuredOutputOptions<T>): Promise<T> {
  const providerSetting = process.env.AI_PROVIDER?.trim().toLowerCase() || 'openai';
  const provider: AIProvider = providerSetting === 'google' ? 'google' : 'openai';
  const apiKey = provider === 'google' ? process.env.GOOGLE_API_KEY?.trim() : process.env.OPENAI_API_KEY?.trim();
  const model = provider === 'google'
    ? process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
    : process.env.AI_MODEL?.trim() || 'gpt-4o-mini';
  const startedAt = performance.now();
  let usage: ReturnType<typeof usageFrom> = {};

  try {
    assertAIConfiguration(apiKey, providerSetting);
    let response: Response;
    try {
      response = await fetch(provider === 'google'
        ? `${googleGenerateEndpoint}/${encodeURIComponent(model)}:generateContent`
        : openAiEndpoint, provider === 'google'
        ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: options.systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
            generationConfig: {
              maxOutputTokens: 1200,
              responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: options.outputSchema } },
            },
          }),
        }
        : {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            temperature: 0,
            max_completion_tokens: 1200,
            response_format: {
              type: 'json_schema',
              json_schema: { name: options.operation, strict: true, schema: options.outputSchema },
            },
            messages: [
              { role: 'system', content: options.systemInstruction },
              { role: 'user', content: options.prompt },
            ],
          }),
        });
    } catch (error) {
      if (isTimeout(error)) throw new AIProviderTimeoutError();
      throw new AIResponseError('Could not reach the configured AI provider.', false);
    }

    if (!response.ok) throw providerApiError(provider, response.status, await response.json().catch(() => null), model);
    const extracted = contentFrom(await responsePayload(response), provider);
    usage = extracted.usage;
    const parsed = options.parse(parseJsonContent(extracted.content));
    recordAIOperation({
      operation: options.operation,
      provider,
      outcome: 'success',
      durationMs: performance.now() - startedAt,
      ...usage,
    });
    return parsed;
  } catch (error) {
    recordAIOperation({
      operation: options.operation,
      provider,
      outcome: error instanceof AIProviderTimeoutError ? 'timeout' : 'failure',
      durationMs: performance.now() - startedAt,
      schemaValidationFailure: error instanceof AIResponseError && error.schemaValidationFailure,
      ...usage,
    });
    throw error;
  }
}
