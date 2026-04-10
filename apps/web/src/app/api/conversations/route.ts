import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import type { ConversationMeta } from "@/lib/storage";

function toMeta(row: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  storyProjectId: string | null;
  storyProject: { name: string } | null;
}): ConversationMeta {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    storyProjectId: row.storyProjectId,
    storyProjectName: row.storyProject?.name ?? null,
  };
}

export async function GET(request: Request) {
  const userId = getUserId(request);
  const rows = await prisma.conversation.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      storyProjectId: true,
      storyProject: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(rows.map(toMeta));
}
