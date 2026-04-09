import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { logError, logRequest } from "@/lib/api-logger";
import { parseCharacterMarkdown } from "@/lib/character-markdown-parser";
import { getUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";
import { resolveProjectAuthoringModeFromSource } from "@/lib/story-project-core";
import {
  getStoryProjectRow,
  regenerateStoryProject,
  toStoryCharacterRecord,
} from "@/lib/story-project-db";
import type { CharacterProvenance } from "@/lib/story-project-types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  const { id, charId } = await params;
  logRequest("/api/story-projects/[id]/characters/[charId]/parse", {
    method: "POST",
    id,
    charId,
  });
  const userId = getUserId(request);

  try {
    // eslint-disable-next-line complexity
    const result = await prisma.$transaction(async (tx) => {
      const project = await getStoryProjectRow(tx, userId, id);
      const character = project?.characters.find((item) => item.id === charId);
      if (!project || !character) {
        return { kind: "not-found" as const };
      }

      const markdown = character.importedMarkdown?.trim();
      if (!markdown) {
        return { kind: "missing-import" as const };
      }

      const parsed = parseCharacterMarkdown(markdown);
      const nextProvenance: CharacterProvenance = {
        ...((character.provenance as CharacterProvenance | null) ?? {}),
      };
      const data: Prisma.StoryCharacterUpdateInput = {};
      let parsedSections = 0;

      if (parsed.identity) {
        data.identity = parsed.identity as unknown as Prisma.InputJsonValue;
        nextProvenance.identity = "imported";
        parsedSections += 1;
      }
      if (parsed.background) {
        data.background = parsed.background;
        nextProvenance.background = "imported";
        parsedSections += 1;
      }
      if (parsed.appearance) {
        data.appearance = parsed.appearance as unknown as Prisma.InputJsonValue;
        nextProvenance.appearance = "imported";
        parsedSections += 1;
      }
      if (parsed.behavioralProfile) {
        data.behavioralProfile =
          parsed.behavioralProfile as unknown as Prisma.InputJsonValue;
        nextProvenance.behavioralProfile = "imported";
        parsedSections += 1;
      }
      if (parsed.startingDemeanor) {
        data.startingDemeanor = parsed.startingDemeanor;
        nextProvenance.startingDemeanor = "imported";
        parsedSections += 1;
      }

      if (parsedSections === 0) {
        return { kind: "nothing-parsed" as const };
      }

      data.provenance = nextProvenance as unknown as Prisma.InputJsonValue;

      const updatedCharacter = await tx.storyCharacter.update({
        where: { id: charId },
        data,
      });

      const refreshed = await getStoryProjectRow(tx, userId, id);
      if (!refreshed) {
        return { kind: "not-found" as const };
      }
      const authoringMode = resolveProjectAuthoringModeFromSource({
        importedSystemPrompt: refreshed.importedSystemPrompt,
        importedStoryState: refreshed.importedStoryState,
        characters: refreshed.characters,
      });
      await regenerateStoryProject(tx, userId, id, authoringMode);

      return {
        kind: "ok" as const,
        character: updatedCharacter,
      };
    });

    if (result.kind === "not-found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.kind === "missing-import") {
      return NextResponse.json(
        { error: "Character has no imported markdown" },
        { status: 400 },
      );
    }
    if (result.kind === "nothing-parsed") {
      return NextResponse.json(
        { error: "No structured sections could be parsed" },
        { status: 400 },
      );
    }

    return NextResponse.json(toStoryCharacterRecord(result.character));
  } catch (error) {
    logError("Character parse failed", error);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
