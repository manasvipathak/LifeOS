import { NextResponse } from 'next/server';
import { registerSchema } from '@/lib/validations/auth';
import connectMongo from '@/lib/db/connect';
import UserModel from '@/models/User';
import { hashPassword, normalizeEmail } from '@/lib/auth/password';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_INPUT',
            message: parsed.error.issues[0]?.message ?? 'Registration input is invalid.',
          },
        },
        { status: 400 },
      );
    }

    await connectMongo();

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const existingUser = await UserModel.findOne({ email: normalizedEmail }).lean();

    if (existingUser) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'An account with that email already exists.',
          },
        },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const user = await UserModel.create({
      name: parsed.data.name,
      email: normalizedEmail,
      passwordHash,
      timezone: parsed.data.timezone ?? 'UTC',
    });

    return NextResponse.json(
      {
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          timezone: user.timezone,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: number }).code === 11000) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'An account with that email already exists.',
          },
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to create your account right now.',
        },
      },
      { status: 500 },
    );
  }
}
