
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth/session";
import JournalEntryModel from "@/models/JournalEntry";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorResponse(
  code: string,
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: { code, message } },
    { status },
  );
}

function validObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse(
        "UNAUTHENTICATED",
        "Authentication is required.",
        401,
      );
    }

    const { id } = await params;

    if (!validObjectId(id)) {
      return errorResponse(
        "INVALID_INPUT",
        "Invalid journal entry ID.",
        400,
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "INVALID_INPUT",
        "Request body must be valid JSON.",
        400,
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse(
        "INVALID_INPUT",
        "A title and content are required.",
        400,
      );
    }

    const input = body as Record<string, unknown>;
    const title =
      typeof input.title === "string" ? input.title.trim() : "";
    const content =
      typeof input.content === "string"
        ? input.content.trim()
        : "";

    if (
      !title ||
      !content ||
      title.length > 120 ||
      content.length > 10000
    ) {
      return errorResponse(
        "INVALID_INPUT",
        "Title and content are required. The title must be at most 120 characters and content at most 10000 characters.",
        400,
      );
    }

    const entry = await JournalEntryModel.findOneAndUpdate(
      { _id: id, userId: user.id },
      { $set: { title, content } },
      { new: true, runValidators: true },
    );

    if (!entry) {
      return errorResponse(
        "NOT_FOUND",
        "Journal entry not found.",
        404,
      );
    }

    return NextResponse.json({
      entry: {
        id: String(entry._id),
        title: entry.title,
        content: entry.content,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    });
  } catch {
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to update your journal entry right now.",
      500,
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse(
        "UNAUTHENTICATED",
        "Authentication is required.",
        401,
      );
    }

    const { id } = await params;

    if (!validObjectId(id)) {
      return errorResponse(
        "INVALID_INPUT",
        "Invalid journal entry ID.",
        400,
      );
    }

    const entry = await JournalEntryModel.findOneAndDelete({
      _id: id,
      userId: user.id,
    });

    if (!entry) {
      return errorResponse(
        "NOT_FOUND",
        "Journal entry not found.",
        404,
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to delete your journal entry right now.",
      500,
    );
  }
}
