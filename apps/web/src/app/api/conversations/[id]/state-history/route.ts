import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import type { StateHistoryEntry } from "@/lib/state-history";

async function verifyOwnership(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const row = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  return row !== null;
}

function toStateHistoryEntry(row: {
  id: string;
  timestamp: Date;
  turnStart: number;
  turnEnd: number;
  previousState: string;
  newState: string;
  extractedFacts: unknown;
  validation: unknown;
  disposition: string;
}): StateHistoryEntry {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    turnRange: [row.turnStart, row.turnEnd],
    previousState: row.previousState,
    newState: row.newState,
    extractedFacts: row.extractedFacts as StateHistoryEntry["extractedFacts"],
    validation: row.validation as StateHistoryEntry["validation"],
    disposition: row.disposition as StateHistoryEntry["disposition"],
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;
  try {
    if (!(await verifyOwnership(id, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const rows = await prisma.stateHistoryEntry.findMany({
      where: { conversationId: id },
      orderBy: { timestamp: "asc" },
    });
    return NextResponse.json(rows.map(toStateHistoryEntry));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;
  try {
    if (!(await verifyOwnership(id, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = (await request.json()) as StateHistoryEntry;
    const row = await prisma.stateHistoryEntry.create({
      data: {
        id: body.id,
        conversationId: id,
        timestamp: new Date(body.timestamp),
        turnStart: body.turnRange[0],
        turnEnd: body.turnRange[1],
        previousState: body.previousState,
        newState: body.newState,
        extractedFacts: body.extractedFacts as unknown as Prisma.InputJsonValue,
        validation: body.validation as unknown as Prisma.InputJsonValue,
        disposition: body.disposition,
      },
    });
    return NextResponse.json(toStateHistoryEntry(row));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;
  try {
    if (!(await verifyOwnership(id, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.stateHistoryEntry.deleteMany({
      where: { conversationId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
