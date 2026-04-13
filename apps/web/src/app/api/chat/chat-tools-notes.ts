import { tool, jsonSchema } from "ai";
import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/api-logger";

const NOTE_CAP = 20;

interface NoteToSelfInput {
  note: string;
}

export function createNoteToSelfTool(conversationId: string) {
  return tool({
    description:
      "Persist an important inference, hypothesis, or tracking detail for future turns. " +
      "Use this to remember patterns, plans, or context that should survive across conversation turns.",
    inputSchema: jsonSchema<NoteToSelfInput>({
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "The note to persist for future turns",
        },
      },
      required: ["note"],
      additionalProperties: false,
    }),
    execute: async ({ note }: NoteToSelfInput) => {
      try {
        await prisma.conversationNote.create({
          data: { conversationId, content: note },
        });

        const count = await prisma.conversationNote.count({
          where: { conversationId },
        });

        if (count > NOTE_CAP) {
          const oldest = await prisma.conversationNote.findMany({
            where: { conversationId },
            orderBy: { createdAt: "asc" },
            take: count - NOTE_CAP,
            select: { id: true },
          });
          if (oldest.length > 0) {
            await prisma.conversationNote.deleteMany({
              where: { id: { in: oldest.map((n) => n.id) } },
            });
          }
        }

        return {
          saved: true,
          noteCount: Math.min(count, NOTE_CAP),
        };
      } catch (error) {
        logWarn("note_to_self: failed to save note", error);
        return { saved: false, noteCount: 0 };
      }
    },
  });
}

const INJECTION_LIMIT = 10;

export async function getRecentNotes(
  conversationId: string | null | undefined,
): Promise<string | null> {
  if (!conversationId) return null;
  try {
    const notes = await prisma.conversationNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: INJECTION_LIMIT,
      select: { content: true },
    });
    if (notes.length === 0) return null;
    const items = notes.map((n) => `- ${n.content}`).join("\n");
    return `[Working memory notes (most recent first):\n${items}]`;
  } catch (error) {
    logWarn("note_to_self: failed to retrieve notes", error);
    return null;
  }
}
