import { embed, embedMany } from "ai";
import { openrouter } from "@/lib/openrouter";
import { logWarn } from "@/lib/api-logger";
import { prisma } from "@/lib/prisma";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";

export type ParsedBackstorySection = {
  sectionName: string;
  content: string;
  order: number;
};

export function parseBackstoryToSections(
  background: string,
): ParsedBackstorySection[] {
  const trimmed = background.trim();
  if (!trimmed) return [];

  // Split by ### headings
  const parts = trimmed.split(/^###\s+/m);
  const sections: ParsedBackstorySection[] = [];
  let order = 0;

  for (const part of parts) {
    const text = part.trim();
    if (!text) continue;

    // Check if this part starts with a heading line (first line is the name)
    const newlineIndex = text.indexOf("\n");
    if (newlineIndex === -1 && sections.length === 0 && parts.length > 1) {
      // Lone heading with no body, skip
      continue;
    }

    if (
      parts.length === 1 ||
      (sections.length === 0 && !trimmed.startsWith("###"))
    ) {
      // No ### headings found, or text before first heading
      sections.push({ sectionName: "General", content: text, order });
      order++;
      continue;
    }

    if (newlineIndex === -1) {
      // Heading with no body content, skip
      continue;
    }

    const sectionName = text.slice(0, newlineIndex).trim();
    const content = text.slice(newlineIndex + 1).trim();
    if (!content) continue;

    sections.push({ sectionName, content, order });
    order++;
  }

  return sections;
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function indexBackstorySections(
  characterId: string,
  background: string | null,
): Promise<void> {
  // Delete existing sections first
  await prisma.$queryRawUnsafe(
    `DELETE FROM "BackstorySection" WHERE "characterId" = $1`,
    characterId,
  );

  if (!background?.trim()) return;

  const sections = parseBackstoryToSections(background);
  if (sections.length === 0) return;

  try {
    // Embed all sections
    const texts = sections.map((s) => `${s.sectionName}: ${s.content}`);
    const { embeddings } = await embedMany({
      model: openrouter.textEmbeddingModel(EMBEDDING_MODEL),
      values: texts,
    });

    // Insert sections with embeddings
    const writes = sections.map(async (section, index) => {
      const embedding = embeddings[index];
      if (!embedding) return;

      await prisma.$queryRawUnsafe(
        `
        INSERT INTO "BackstorySection"
          ("characterId", "sectionName", "content", "embedding", "order")
        VALUES
          ($1, $2, $3, $4::vector, $5)
        `,
        characterId,
        section.sectionName,
        section.content,
        vectorLiteral(embedding),
        section.order,
      );
    });

    await Promise.all(writes);
  } catch (error) {
    logWarn("backstory-parser: indexBackstorySections failed", error);
  }
}

type BackstorySectionResult = {
  sectionName: string;
  content: string;
  relevance?: number;
};

export async function findBackstorySectionByName(
  characterId: string,
  sectionQuery: string,
): Promise<BackstorySectionResult[]> {
  const lower = sectionQuery.toLowerCase();

  const rows = await prisma.$queryRawUnsafe<
    { sectionName: string; content: string }[]
  >(
    `
    SELECT "sectionName", "content"
    FROM "BackstorySection"
    WHERE "characterId" = $1
    ORDER BY "order"
    `,
    characterId,
  );

  // Exact case-insensitive match
  const exact = rows.filter((r) => r.sectionName.toLowerCase() === lower);
  if (exact.length > 0) return exact;

  // Prefix match
  const prefix = rows.filter((r) =>
    r.sectionName.toLowerCase().startsWith(lower),
  );
  if (prefix.length > 0) return prefix;

  // Substring match
  return rows.filter((r) => r.sectionName.toLowerCase().includes(lower));
}

export async function searchBackstoryByKeywords(
  characterId: string,
  keywords: string[],
  limit = 3,
): Promise<BackstorySectionResult[]> {
  const queryText = keywords.join(" ");
  if (!queryText.trim()) return [];

  try {
    const { embedding } = await embed({
      model: openrouter.textEmbeddingModel(EMBEDDING_MODEL),
      value: queryText,
    });

    const rows = await prisma.$queryRawUnsafe<
      { sectionName: string; content: string; similarity: number }[]
    >(
      `
      SELECT "sectionName", "content",
             1 - ("embedding" <=> $2::vector) AS similarity
      FROM "BackstorySection"
      WHERE "characterId" = $1
        AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> $2::vector
      LIMIT $3
      `,
      characterId,
      vectorLiteral(embedding),
      limit,
    );

    // Filter by similarity threshold
    return rows
      .filter((r) => r.similarity >= 0.3)
      .map((r) => ({
        sectionName: r.sectionName,
        content: r.content,
        relevance: Number(Number(r.similarity).toFixed(3)),
      }));
  } catch (error) {
    logWarn("backstory-parser: searchBackstoryByKeywords failed", error);
    return [];
  }
}

export async function resolveBackstoryCharacterId(
  conversationId: string,
): Promise<string | null> {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { storyProjectId: true },
    });
    if (!conv?.storyProjectId) return null;

    const characters = await prisma.storyCharacter.findMany({
      where: { storyProjectId: conv.storyProjectId, isPlayer: false },
      select: { id: true },
      take: 1,
    });
    return characters[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function getAvailableSectionNames(
  characterId: string,
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ sectionName: string }[]>(
    `
    SELECT "sectionName"
    FROM "BackstorySection"
    WHERE "characterId" = $1
    ORDER BY "order"
    `,
    characterId,
  );
  return rows.map((r) => r.sectionName);
}
