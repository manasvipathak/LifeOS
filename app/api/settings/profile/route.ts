import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { MAX_JSON_REQUEST_BYTES, parseJsonRequest } from '@/lib/http/parse-json-request';
import { profileSettingsSchema } from '@/lib/validations/profile-settings';
import UserModel from '@/models/User';

function unauthenticatedResponse() {
  return NextResponse.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } },
    { status: 401 },
  );
}

function profileResponse(profile: { name: string; email: string; timezone: string }) {
  return NextResponse.json({
    profile: {
      name: profile.name,
      email: profile.email,
      timezone: profile.timezone || 'UTC',
    },
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthenticatedResponse();

    return profileResponse(user);
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to load profile settings right now.' } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthenticatedResponse();

    const body = await parseJsonRequest(request, MAX_JSON_REQUEST_BYTES);
    if (!body.success && body.reason === 'too_large') {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'Request body must be 32 KiB or smaller.' } },
        { status: 413 },
      );
    }
    if (!body.success) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON.' } },
        { status: 400 },
      );
    }

    const parsed = profileSettingsSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Profile settings are invalid.' } },
        { status: 400 },
      );
    }

    const profile = await UserModel.findOneAndUpdate(
      { _id: user.id },
      { $set: { name: parsed.data.name, timezone: parsed.data.timezone } },
      { new: true, runValidators: true },
    ).select('name email timezone').lean();

    if (!profile) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Profile was not found.' } },
        { status: 404 },
      );
    }

    return profileResponse({
      name: profile.name,
      email: profile.email,
      timezone: profile.timezone ?? 'UTC',
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to save profile settings right now.' } },
      { status: 500 },
    );
  }
}
