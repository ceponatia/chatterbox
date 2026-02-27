import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ConversationMeta } from "@/lib/storage";

function toMeta(row: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}): ConversationMeta {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const rows = await prisma.conversation.findMany({
    select: { id: true, title: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(rows.map(toMeta));
}
