/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  extractTaskProposals: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/ai/task-extraction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/task-extraction')>();
  return { ...actual, extractTaskProposals: mocks.extractTaskProposals };
});

import { POST } from '@/app/api/ai/extract-tasks/route';
import { AIConfigurationError, assertAIConfiguration, OpenAIAPIError, parseTaskProposals } from '@/lib/ai/task-extraction';

function request(body: unknown) {
  return new Request('http://localhost/api/ai/extract-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: '64b000000000000000000001',
    name: 'Ava',
    email: 'ava@example.com',
    timezone: 'America/Los_Angeles',
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AI task extraction', () => {
  it('validates and normalizes valid structured proposals', () => {
    const proposals = parseTaskProposals(JSON.stringify({
      tasks: [
        { title: '  Prepare project notes  ', priority: 'high', dueDate: '2026-11-02' },
        { title: 'Book dentist', priority: 'low', dueDate: null },
      ],
    }));

    expect(proposals).toEqual([
      { title: 'Prepare project notes', priority: 'high', dueDate: '2026-11-02' },
      { title: 'Book dentist', priority: 'low', dueDate: null },
    ]);
  });

  it('rejects malformed JSON and invalid proposal fields', () => {
    expect(() => parseTaskProposals('{not json')).toThrow('invalid response');
    expect(() => parseTaskProposals(JSON.stringify({
      tasks: [{ title: 'Task', priority: 'urgent', dueDate: '2026-02-30' }],
    }))).toThrow('invalid response');
  });

  it('reports missing OpenAI configuration without making a request', async () => {
    expect(() => assertAIConfiguration('', 'openai')).toThrow(AIConfigurationError);
  });

  it('returns a setup response when provider configuration is missing', async () => {
    mocks.extractTaskProposals.mockRejectedValue(new AIConfigurationError());

    const response = await POST(request({ text: 'Prepare notes' }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('AI_NOT_CONFIGURED');
    expect(body.error.message).toContain('OPENAI_API_KEY');
  });

  it('returns mapped provider errors without logging request or provider content', async () => {
    const userText = 'private description that must not be logged';
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    mocks.extractTaskProposals.mockRejectedValue(new OpenAIAPIError({
      status: 429,
      code: 'insufficient_quota',
      type: 'insufficient_quota',
      message: 'Quota exceeded for the current project.',
    }, { error: { private: userText } }, 'gpt-4o-mini'));

    const response = await POST(request({ text: userText }));
    const body = await response.json();
    const logged = JSON.stringify(log.mock.calls);

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('AI_QUOTA_EXCEEDED');
    expect(body.error.message).toContain('billing');
    expect(log).not.toHaveBeenCalled();
    expect(logged).not.toContain(userText);
  });

  it('requires an authenticated user before invoking the provider', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(request({ text: 'Prepare notes' }));

    expect(response.status).toBe(401);
    expect(mocks.extractTaskProposals).not.toHaveBeenCalled();
  });

  it('rejects empty, oversized, or owner-bearing input', async () => {
    const malformedResponse = await POST(new Request('http://localhost/api/ai/extract-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{malformed',
    }));
    const emptyResponse = await POST(request({ text: '   ' }));
    const ownerResponse = await POST(request({ text: 'Prepare notes', userId: '64b000000000000000000002' }));
    const longResponse = await POST(request({ text: 'a'.repeat(6001) }));
    const oversizedBodyResponse = await POST(request({ text: 'a'.repeat(33_000) }));

    expect(malformedResponse.status).toBe(400);
    expect(emptyResponse.status).toBe(400);
    expect(ownerResponse.status).toBe(400);
    expect(longResponse.status).toBe(400);
    expect(oversizedBodyResponse.status).toBe(413);
    expect(mocks.extractTaskProposals).not.toHaveBeenCalled();
  });

  it('uses the authenticated user timezone and returns validated proposals', async () => {
    const proposals = [{ title: 'Prepare notes', priority: 'medium', dueDate: null }];
    mocks.extractTaskProposals.mockResolvedValue(proposals);

    const response = await POST(request({ text: 'Prepare notes by Friday' }));

    expect(response.status).toBe(200);
    expect(mocks.extractTaskProposals).toHaveBeenCalledWith('Prepare notes by Friday', 'America/Los_Angeles');
    await expect(response.json()).resolves.toEqual({ proposals });
  });
});