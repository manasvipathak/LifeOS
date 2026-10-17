
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import JournalEntryModel from "@/models/JournalEntry";

function journalEntryResponse(entry: {
  _id: unknown;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(entry._id),
    title: entry.title,
    content: entry.content,
    createdAt: new Date(entry.createdAt).toISOString(),
    updatedAt: new Date(entry.updatedAt).toISOString(),
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication is required.",
          },
        },
        { status: 401 },
      );
    }

    const entries = await JournalEntryModel.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      entries: entries.map((entry) =>
        journalEntryResponse({
          ...entry,
          _id: entry._id,
          title: entry.title,
          content: entry.content,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        }),
      ),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to load journal entries right now.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication is required.",
          },
        },
        { status: 401 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INPUT",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INPUT",
            message: "A title and journal entry are required.",
          },
        },
        { status: 400 },
      );
    }

    const input = body as Record<string, unknown>;
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const content =
      typeof input.content === "string" ? input.content.trim() : "";

    if (!title || !content || title.length > 120 || content.length > 10000) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INPUT",
            message:
              "Title and content are required. The title must be at most 120 characters and the entry at most 10000 characters.",
          },
        },
        { status: 400 },
      );
    }

    const entry = await JournalEntryModel.create({
      userId: user.id,
      title,
      content,
    });

    return NextResponse.json(
      { entry: journalEntryResponse(entry) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to save your journal entry right now.",
        },
      },
      { status: 500 },
    );
  }
}
