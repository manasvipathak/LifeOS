/// <reference types="vitest/globals" />

import { normalizeEmail, hashPassword, verifyPassword } from '@/lib/auth/password';
import { loginSchema, registerSchema } from '@/lib/validations/auth';
import UserModel from '@/models/User';

describe('authentication primitives', () => {
  it('normalizes email to lowercase', () => {
    expect(normalizeEmail(' User@Example.com ')).toBe('user@example.com');
  });

  it('hashes and verifies a password', async () => {
    const encrypted = await hashPassword('StrongPassword123!');

    expect(encrypted).not.toBe('StrongPassword123!');
    expect(await verifyPassword('StrongPassword123!', encrypted)).toBe(true);
    expect(await verifyPassword('wrong-password', encrypted)).toBe(false);
  });

  it('omits password hashes from serialized users', () => {
    const user = new UserModel({
      name: 'Ava',
      email: 'ava@example.com',
      passwordHash: 'bcrypt-hash-value',
    });

    const serialized = user.toJSON();

    expect(serialized).not.toHaveProperty('passwordHash');
    expect(serialized).not.toHaveProperty('__v');
  });

  it('accepts valid registration input and rejects weak password', () => {
    const valid = registerSchema.parse({
      name: 'Ava',
      email: 'ava@example.com',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
      timezone: 'UTC',
    });

    expect(valid.email).toBe('ava@example.com');

    expect(() =>
      registerSchema.parse({
        name: 'Ava',
        email: 'ava@example.com',
        password: 'short',
        confirmPassword: 'short',
        timezone: 'UTC',
      }),
    ).toThrow();
  });

  it('accepts valid login input and rejects missing fields', () => {
    const session = loginSchema.parse({
      email: 'ava@example.com',
      password: 'StrongPassword123!',
    });

    expect(session.email).toBe('ava@example.com');

    expect(() =>
      loginSchema.parse({
        email: '',
        password: '',
      }),
    ).toThrow();
  });
});
