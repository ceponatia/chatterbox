import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StateHistoryEntry } from "@/lib/state-history";

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
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rows = await prisma.stateHistoryEntry.findMany({
    where: { conversationId: id },
    orderBy: { timestamp: "asc" },
  });
  return NextResponse.json(rows.map(toStateHistoryEntry));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.stateHistoryEntry.deleteMany({ where: { conversationId: id } });
  return NextResponse.json({ ok: true });
}
