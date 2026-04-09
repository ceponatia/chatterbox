import {
  parseMarkdownToStructured,
  resolveEntityName,
} from "@chatterbox/state-model";
import { compactText } from "./chat-tools";

function latestIsoTimestamp(...values: Array<string | undefined>): string {
  let latest = "";
  for (const value of values) {
    if (!value) continue;
    if (value > latest) latest = value;
  }
  return latest;
}

function trimTrailingPunctuation(text: string): string {
  return text.trim().replace(/[.?!,;:\s]+$/g, "");
}

function dedupeNames(names: readonly string[]): string[] {
  return names.filter(
    (name, index, all) => name.length > 0 && all.indexOf(name) === index,
  );
}

function selectRecentThread(
  threads: ReturnType<typeof parseMarkdownToStructured>["openThreads"],
) {
  return threads
    .filter(
      (thread) =>
        (thread.status === "active" || thread.status === "evolved") &&
        (thread.hook || thread.description),
    )
    .sort((a, b) => {
      const aTs = latestIsoTimestamp(a.lastReferencedAt, a.createdAt);
      const bTs = latestIsoTimestamp(b.lastReferencedAt, b.createdAt);
      return bTs.localeCompare(aTs);
    })[0];
}

function selectRecentFact(
  facts: ReturnType<typeof parseMarkdownToStructured>["hardFacts"],
) {
  return facts
    .filter((fact) => !fact.superseded && (fact.summary || fact.fact))
    .sort((a, b) => {
      const aTs = latestIsoTimestamp(
        a.lastConfirmedAt,
        a.establishedAt,
        a.createdAt,
      );
      const bTs = latestIsoTimestamp(
        b.lastConfirmedAt,
        b.establishedAt,
        b.createdAt,
      );
      return bTs.localeCompare(aTs);
    })[0];
}

function buildEventLine(
  thread: ReturnType<typeof selectRecentThread>,
  fact: ReturnType<typeof selectRecentFact>,
): string | null {
  const eventText = thread?.hook ?? thread?.description;
  if (eventText) {
    return `Active thread: ${compactText(trimTrailingPunctuation(eventText), 90)}.`;
  }

  const factText = fact?.summary ?? fact?.fact;
  if (factText) {
    return `Recent fact: ${compactText(trimTrailingPunctuation(factText), 90)}.`;
  }

  return null;
}

export function buildDepthNote(
  storyState: string,
  presentEntityIds: readonly string[],
): string | null {
  const structured = parseMarkdownToStructured(storyState);
  const atmosphere = trimTrailingPunctuation(structured.scene.atmosphere || "");
  const presentNames = dedupeNames(
    presentEntityIds.map((id) =>
      resolveEntityName(structured.entities, id).trim(),
    ),
  );

  if (!atmosphere && presentNames.length === 0) {
    return null;
  }

  const recentThread = selectRecentThread(structured.openThreads);
  const recentFact = selectRecentFact(structured.hardFacts);

  const sceneLine = atmosphere ? `Scene context: ${atmosphere}.` : null;
  const presentLine =
    presentNames.length > 0 ? `Present: ${presentNames.join(", ")}.` : null;
  const eventLine = buildEventLine(recentThread, recentFact);

  const note = [
    sceneLine,
    presentLine,
    eventLine,
    "Narration: one beat per turn. Ground in sensory detail. Reference appearance naturally.",
  ]
    .filter(Boolean)
    .join(" ");

  return note ? `[${note}]` : null;
}
