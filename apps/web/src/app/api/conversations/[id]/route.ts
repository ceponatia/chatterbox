import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import type { Conversation } from "@/lib/storage";

function toConversation(row: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: unknown;
  systemPrompt: string;
  storyState: string;
  previousStoryState: string | null;
  storyStateLastUpdated: Date | null;
  settings: unknown;
  systemPromptBaseline: string | null;
  storyStateBaseline: string | null;
  lastIncludedAt: unknown;
  customSegments: unknown | null;
  structuredState: unknown | null;
  lastSummarizedTurn: number | null;
  lastPipelineTurn: number | null;
}): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: (row.messages ?? []) as Conversation["messages"],
    systemPrompt: row.systemPrompt ?? "",
    storyState: row.storyState ?? "",
    previousStoryState: row.previousStoryState ?? null,
    storyStateLastUpdated: row.storyStateLastUpdated
      ? row.storyStateLastUpdated.toISOString()
      : null,
    settings: (row.settings ?? {}) as Conversation["settings"],
    systemPromptBaseline: row.systemPromptBaseline ?? null,
    storyStateBaseline: row.storyStateBaseline ?? null,
    lastIncludedAt: (row.lastIncludedAt ??
      {}) as Conversation["lastIncludedAt"],
    customSegments: (row.customSegments ??
      null) as Conversation["customSegments"],
    structuredState: (row.structuredState ??
      null) as Conversation["structuredState"],
    lastSummarizedTurn: row.lastSummarizedTurn ?? 0,
    lastPipelineTurn: row.lastPipelineTurn ?? 0,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;
  const row = await prisma.conversation.findFirst({
    where: { id, userId },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toConversation(row));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;
  const body = (await request.json()) as Conversation;
  if (!body || body.id !== id) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const data = {
    id: body.id,
    userId,
    title: body.title,
    createdAt: new Date(body.createdAt),
    updatedAt: new Date(body.updatedAt),
    messages: body.messages as unknown as Prisma.InputJsonValue,
    systemPrompt: body.systemPrompt,
    storyState: body.storyState,
    previousStoryState: body.previousStoryState,
    storyStateLastUpdated: body.storyStateLastUpdated
      ? new Date(body.storyStateLastUpdated)
      : null,
    settings: body.settings as unknown as Prisma.InputJsonValue,
    systemPromptBaseline: body.systemPromptBaseline,
    storyStateBaseline: body.storyStateBaseline,
    lastIncludedAt: body.lastIncludedAt as unknown as Prisma.InputJsonValue,
    customSegments:
      (body.customSegments as unknown as Prisma.InputJsonValue) ?? undefined,
    structuredState:
      (body.structuredState as unknown as Prisma.InputJsonValue) ?? undefined,
    lastSummarizedTurn: body.lastSummarizedTurn ?? 0,
    lastPipelineTurn: body.lastPipelineTurn ?? 0,
  };
  const row = await prisma.conversation.upsert({
    where: { id: body.id },
    update: { ...data, userId: undefined },
    create: data,
  });
  return NextResponse.json(toConversation(row));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;
  await prisma.conversation.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
