/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/models/User', () => ({
  default: { findOneAndUpdate: mocks.findOneAndUpdate },
}));

import { GET, PATCH } from '@/app/api/settings/profile/route';

const user = {
  id: '64b000000000000000000001',
  name: 'Ava',
  email: 'ava@example.com',
  timezone: 'UTC',
};

function request(body: string, method = 'PATCH') {
  return new Request('http://localhost/api/settings/profile', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.findOneAndUpdate.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue({
      name: 'Ava Lovelace',
      email: 'ava@example.com',
      timezone: 'America/Los_Angeles',
    }),
  });
});

describe('profile settings API', () => {
  it('requires authentication before reading or updating profile settings', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const getResponse = await GET();
    const patchResponse = await PATCH(request(JSON.stringify({
      name: 'Ava Lovelace',
      timezone: 'UTC',
    })));

    expect(getResponse.status).toBe(401);
    expect(patchResponse.status).toBe(401);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns only the authenticated profile fields', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profile: {
        name: user.name,
        email: user.email,
        timezone: user.timezone,
      },
    });
  });

  it('validates profile input and rejects fields outside the supported schema', async () => {
    const malformed = await PATCH(request('{broken'));
    const invalidTimezone = await PATCH(request(JSON.stringify({ name: 'Ava', timezone: 'Not/A_Timezone' })));
    const oversized = await PATCH(request(JSON.stringify({ name: 'A'.repeat(33_000), timezone: 'UTC' })));
    const passwordChange = await PATCH(request(JSON.stringify({
      name: 'Ava Lovelace',
      timezone: 'UTC',
      password: 'NewPassword123',
    })));

    expect(malformed.status).toBe(400);
    expect(invalidTimezone.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(passwordChange.status).toBe(400);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('updates only editable fields for the authenticated user and returns a safe profile', async () => {
    const response = await PATCH(request(JSON.stringify({
      name: ' Ava Lovelace ',
      timezone: ' America/Los_Angeles ',
    })));

    expect(response.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: user.id },
      { $set: { name: 'Ava Lovelace', timezone: 'America/Los_Angeles' } },
      { new: true, runValidators: true },
    );
    const result = await response.json();
    expect(result.profile).toEqual({
      name: 'Ava Lovelace',
      email: 'ava@example.com',
      timezone: 'America/Los_Angeles',
    });
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('returns not found when the authenticated user record is no longer present', async () => {
    mocks.findOneAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    const response = await PATCH(request(JSON.stringify({ name: 'Ava Lovelace', timezone: 'UTC' })));

    expect(response.status).toBe(404);
  });
});
