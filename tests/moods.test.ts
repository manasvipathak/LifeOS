/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/models/MoodEntry', () => ({
  default: {
    find: mocks.find,
    countDocuments: mocks.countDocuments,
    create: mocks.create,
  },
}));

import { GET, POST } from '@/app/api/moods/route';

const currentUser = {
  id: '64b000000000000000000001',
  name: 'Ava',
  email: 'ava@example.com',
  timezone: 'UTC',
};

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    _id: '64b000000000000000000002',
    mood: 'happy',
    note: 'A good day',
    createdAt: new Date('2026-10-16T12:00:00.000Z'),
    ...overrides,
  };
}

function request(url: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(currentUser);
});

describe('mood API authorization and validation', () => {
  it('rejects unauthenticated history and save requests', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const history = await GET(request('http://localhost/api/moods'));
    const save = await POST(request('http://localhost/api/moods', 'POST', { mood: 'happy' }));

    expect(history.status).toBe(401);
    expect(save.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns only the signed-in user mood history', async () => {
    mocks.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([makeEntry()]) }),
    });
    mocks.countDocuments.mockResolvedValue(1);

    const response = await GET(request('http://localhost/api/moods?limit=10'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({ userId: currentUser.id });
    expect(mocks.countDocuments).toHaveBeenCalledWith({ userId: currentUser.id });
    expect(body.entries[0]).toEqual({
      id: '64b000000000000000000002',
      mood: 'happy',
      note: 'A good day',
      createdAt: '2026-10-16T12:00:00.000Z',
    });
    expect(body.entries[0]).not.toHaveProperty('userId');
  });

  it('stores the chosen mood with the authenticated owner and server timestamp', async () => {
    const entry = makeEntry({ note: '  Feeling good  ' });
    mocks.create.mockResolvedValue(entry);

    const response = await POST(request('http://localhost/api/moods', 'POST', { mood: 'happy', note: '  Feeling good  ' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ mood: 'happy', note: 'Feeling good', userId: currentUser.id });
    expect(body.entry.createdAt).toBe('2026-10-16T12:00:00.000Z');
  });

  it('rejects unsupported moods, oversized notes, and client owner IDs', async () => {
    const mood = await POST(request('http://localhost/api/moods', 'POST', { mood: 'angry' }));
    const note = await POST(request('http://localhost/api/moods', 'POST', { mood: 'neutral', note: 'x'.repeat(281) }));
    const ownerId = await POST(request('http://localhost/api/moods', 'POST', {
      mood: 'sad',
      userId: '64b000000000000000000099',
    }));

    expect(mood.status).toBe(400);
    expect(note.status).toBe(400);
    expect(ownerId.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects invalid history limits', async () => {
    const response = await GET(request('http://localhost/api/moods?limit=1000'));

    expect(response.status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });
});