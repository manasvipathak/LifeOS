/// <reference types="vitest/globals" />

import {
  extractTaskProposals,
  AIResponseError,
  GoogleGeminiAPIError,
  mapGoogleGeminiError,
  mapOpenAIError,
  OpenAIAPIError,
  type OpenAIErrorInfo,
} from '@/lib/ai/task-extraction';

function providerError(info: OpenAIErrorInfo) {
  return new OpenAIAPIError(info, { error: { code: info.code, type: info.type, message: info.message } }, 'gpt-4o-mini');
}

describe('OpenAI provider error handling', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('discards a provider-invented due date when the input has no date', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    vi.stubEnv('AI_MODEL', 'gpt-4o-mini');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        tasks: [{ title: 'Draft the proposal', priority: 'medium', dueDate: '2026-10-20' }],
      }) } }],
    }), { status: 200 })));

    const proposals = await extractTaskProposals('Draft the proposal', 'UTC');

    expect(proposals).toEqual([{ title: 'Draft the proposal', priority: 'medium', dueDate: null }]);
  });

  it('does not call OpenAI when its API key is missing', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(extractTaskProposals('Draft the proposal', 'UTC')).rejects.toThrow('OPENAI_API_KEY');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed OpenAI task output', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    vi.stubEnv('AI_MODEL', 'gpt-4o-mini');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{invalid json' } }],
    }), { status: 200 })));

    await expect(extractTaskProposals('Draft the proposal', 'UTC')).rejects.toBeInstanceOf(AIResponseError);
  });

  it('resolves a supported relative date and drops ambiguous numeric dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    vi.stubEnv('AI_MODEL', 'gpt-4o-mini');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          tasks: [{ title: 'Submit report', priority: 'high', dueDate: '2026-10-18' }],
        }) } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          tasks: [{ title: 'Schedule follow-up', priority: 'medium', dueDate: '2026-03-04' }],
        }) } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          tasks: [{ title: 'Finish draft', priority: 'high', dueDate: '2026-11-02' }],
        }) } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const tomorrow = await extractTaskProposals('Submit report by tomorrow', 'UTC');
    const ambiguous = await extractTaskProposals('Schedule follow-up for 03/04/2026', 'UTC');
    const explicit = await extractTaskProposals('Finish draft on November 2, 2026', 'UTC');

    expect(tomorrow[0].dueDate).toBe('2026-10-18');
    expect(ambiguous[0].dueDate).toBeNull();
    expect(explicit[0].dueDate).toBe('2026-11-02');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ status: 401, code: 'invalid_api_key', type: 'authentication_error', message: 'Invalid API key.' }, 401, 'AI_AUTHENTICATION_FAILED'],
    [{ status: 429, code: 'insufficient_quota', type: 'insufficient_quota', message: 'Quota exceeded.' }, 429, 'AI_QUOTA_EXCEEDED'],
    [{ status: 429, code: 'credit_balance_exhausted', type: 'insufficient_quota', message: 'You have no credits remaining.' }, 429, 'AI_QUOTA_EXCEEDED'],
    [{ status: 429, code: 'rate_limit_exceeded', type: 'rate_limit_error', message: 'Too many requests.' }, 429, 'AI_RATE_LIMITED'],
    [{ status: 404, code: 'model_not_found', type: 'invalid_request_error', message: 'The model was not found.' }, 404, 'AI_MODEL_UNAVAILABLE'],
    [{ status: 400, code: 'model_not_found', type: 'invalid_request_error', message: 'The model is not available.' }, 400, 'AI_MODEL_UNAVAILABLE'],
    [{ status: 503, code: 'server_error', type: 'server_error', message: 'Temporary service issue.' }, 503, 'AI_TEMPORARILY_UNAVAILABLE'],
  ] as const)('maps provider error categories safely', (details, expectedStatus, expectedCode) => {
    const mapped = mapOpenAIError(providerError(details));

    expect(mapped.status).toBe(expectedStatus);
    expect(mapped.code).toBe(expectedCode);
    expect(mapped.message).not.toContain(details.message);
  });

  it('preserves provider cause while redacting key and user input from diagnostics', async () => {
    const apiKey = 'sk-test-key-never-log-this';
    const userText = 'private task description never log this';
    const providerMessage = `Invalid request for ${userText}; credential ${apiKey}`;
    const originalResponseBody = {
      error: {
        code: 'invalid_api_key',
        type: 'authentication_error',
        message: providerMessage,
      },
    };

    vi.stubEnv('OPENAI_API_KEY', apiKey);
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('AI_MODEL', 'gpt-4o-mini');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(originalResponseBody), { status: 401 })));

    let caught: unknown;
    try {
      await extractTaskProposals(userText, 'UTC');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(OpenAIAPIError);
    const error = caught as OpenAIAPIError;
    expect(error.status).toBe(401);
    expect(error.code).toBe('invalid_api_key');
    expect(error.type).toBe('authentication_error');
    expect(error.providerMessage).toContain('[redacted user input]');
    expect(error.providerMessage).toContain('[redacted API key]');
    expect(error.providerMessage).not.toContain(userText);
    expect(error.providerMessage).not.toContain(apiKey);
    expect(error.cause).toEqual(originalResponseBody);
    expect(error.model).toBe('gpt-4o-mini');
  });

  it('uses Gemini free-tier model, structured output, and its server-only key', async () => {
    vi.stubEnv('AI_PROVIDER', 'google');
    vi.stubEnv('GOOGLE_API_KEY', 'google-test-key');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    vi.stubEnv('AI_MODEL', 'gpt-4o-mini');
    vi.stubEnv('GEMINI_MODEL', '');

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        tasks: [{ title: 'Review notes', priority: 'medium', dueDate: null }],
      }) }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const proposals = await extractTaskProposals('Review notes', 'UTC');

    expect(proposals).toEqual([{ title: 'Review notes', priority: 'medium', dueDate: null }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('google-test-key');
    expect(new Headers(init.headers).has('authorization')).toBe(false);
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseFormat.text.mimeType).toBe('APPLICATION_JSON');
    expect(body.generationConfig.responseFormat.text.schema.properties.tasks.type).toBe('array');
  });

  it('does not fall back to the OpenAI key when Gemini is selected', async () => {
    vi.stubEnv('AI_PROVIDER', 'google');
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(extractTaskProposals('Review notes', 'UTC')).rejects.toThrow('GOOGLE_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the existing OpenAI endpoint and model when OpenAI is selected', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
    vi.stubEnv('AI_MODEL', 'gpt-4o-mini');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ tasks: [] }) } }],
    }), { status: 200 })));

    await extractTaskProposals('Review notes', 'UTC');

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer openai-test-key');
    expect(JSON.parse(String(init.body)).model).toBe('gpt-4o-mini');
  });

  it.each([
    [{ status: 400, code: 'API_KEY_INVALID', type: 'INVALID_ARGUMENT', message: 'API key is invalid.' }, 401, 'AI_AUTHENTICATION_FAILED'],
    [{ status: 429, code: 'RESOURCE_EXHAUSTED', type: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded.' }, 429, 'AI_QUOTA_EXCEEDED'],
    [{ status: 404, code: 'NOT_FOUND', type: 'NOT_FOUND', message: 'Model was not found.' }, 404, 'AI_MODEL_UNAVAILABLE'],
  ] as const)('maps Gemini errors to actionable responses', (details, expectedStatus, expectedCode) => {
    const error = new GoogleGeminiAPIError(details, details, 'gemini-2.5-flash-lite');
    const mapped = mapGoogleGeminiError(error);

    expect(mapped.status).toBe(expectedStatus);
    expect(mapped.code).toBe(expectedCode);
  });
});