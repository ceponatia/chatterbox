import { embed, embedMany } from "ai";
import { logWarn } from "@/lib/api-logger";
import { openrouter } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const MAX_SIDE_CHARS = 500;

type MessagePair = {
  turnIndex: number;
  userText: string;
  assistantText: string;
};

type RetrievedPair = {
  turnIndex: number;
  userText: string;
  assistantText: string;
};

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd();
}

function toCombinedText(pair: MessagePair): string {
  const userText = truncateText(pair.userText, MAX_SIDE_CHARS);
  const assistantText = truncateText(pair.assistantText, MAX_SIDE_CHARS);
  return `User: ${userText}\nCharacter: ${assistantText}`;
}

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function embedMessagePairs(
  conversationId: string,
  userId: string,
  pairs: MessagePair[],
): Promise<void> {
  if (!conversationId || pairs.length === 0) return;

  try {
    const texts = pairs.map((pair) => toCombinedText(pair));
    const { embeddings } = await embedMany({
      model: openrouter.textEmbeddingModel(EMBEDDING_MODEL),
      values: texts,
    });

    const writes = pairs.map(async (pair, index) => {
      const embedding = embeddings[index];
      const combinedText = texts[index];
      if (!embedding || !combinedText) return;

      await prisma.$queryRawUnsafe(
        `
          INSERT INTO "MessageEmbedding"
            ("conversationId", "userId", "turnIndex", "userText", "assistantText", "combinedText", "embedding")
          VALUES
            ($1, $2, $3, $4, $5, $6, $7::vector)
          ON CONFLICT ("conversationId", "turnIndex") DO NOTHING
        `,
        conversationId,
        userId,
        pair.turnIndex,
        pair.userText,
        pair.assistantText,
        combinedText,
        vectorLiteral(embedding),
      );
    });

    await Promise.all(writes);
  } catch (error) {
    logWarn("message-embeddings: embedMessagePairs failed", error);
  }
}

export async function retrieveSimilarPairs(
  conversationId: string,
  queryText: string,
  limit = 5,
): Promise<RetrievedPair[]> {
  if (!conversationId || !queryText.trim()) return [];

  try {
    const { embedding } = await embed({
      model: openrouter.textEmbeddingModel(EMBEDDING_MODEL),
      value: queryText,
    });

    const rows = await prisma.$queryRawUnsafe<RetrievedPair[]>(
      `
        SELECT "turnIndex", "userText", "assistantText"
        FROM "MessageEmbedding"
        WHERE "conversationId" = $1
        ORDER BY "embedding" <=> $2::vector
        LIMIT $3
      `,
      conversationId,
      vectorLiteral(embedding),
      Math.max(1, Math.floor(limit)),
    );

    return [...rows].sort((a, b) => a.turnIndex - b.turnIndex);
  } catch (error) {
    logWarn("message-embeddings: retrieveSimilarPairs failed", error);
    return [];
  }
}
