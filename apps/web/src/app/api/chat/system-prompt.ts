import type { SerializedSegment } from "@chatterbox/prompt-assembly";

export type SystemPromptMessage = {
  role: "system";
  content: string;
  providerOptions?: Record<string, Record<string, unknown>>;
};

const TOOLS_INSTRUCTION = [
  "## Tool Usage",
  "- Use tools only when specific missing detail is needed for this turn.",
  "- If the user asks about relationships, hard facts, or unresolved threads, call get_story_context before answering.",
  "- Prefer at most 1 tool call per turn; use a 2nd call only if strictly necessary.",
  "- Prefer compact retrieval first; request broader detail only when needed.",
  "- If details are not needed for the current turn, respond without calling tools.",
].join("\n");

const NPC_ONLY_GUARDRAIL = [
  "## Response Boundary (Critical)",
  "- NEVER write dialogue, actions, thoughts, decisions, intentions, or internal state on behalf of the user/player.",
  "- Only write for NPCs and the environment.",
  "- Leave all user/player speech, actions, and choices for the user to provide.",
  "- If uncertain whether a named person is the user/player, treat them as player-controlled and avoid writing for them.",
].join("\n");

export function createSystemMessage(
  content: string,
  withCacheControl: boolean,
): SystemPromptMessage {
  if (!withCacheControl) {
    return { role: "system", content };
  }

  return {
    role: "system",
    content,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  };
}

export function buildSystemPrompt(
  assemblyPrompt: string,
  storyState: string,
  runtimeBoundary: string,
  toolUseEnabled: boolean,
): SystemPromptMessage[] {
  const promptContent = toolUseEnabled
    ? `${assemblyPrompt}\n\n${TOOLS_INSTRUCTION}`
    : assemblyPrompt;
  const messages: SystemPromptMessage[] = [
    createSystemMessage(promptContent, true),
  ];

  if (storyState) {
    messages.push(
      createSystemMessage(
        "## Current Story State\n\n" +
          "The following is the current canon of this roleplay. All facts listed are established truth - do not contradict them, especially Hard Facts.\n\n" +
          storyState,
        true,
      ),
    );
  }

  messages.push(createSystemMessage(runtimeBoundary, false));
  messages.push(createSystemMessage(NPC_ONLY_GUARDRAIL, false));
  return messages;
}

function normalizeAlias(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(
      /^["'\u201c\u201d\u2018\u2019]|["'\u201c\u201d\u2018\u2019.!,?:;]+$/g,
      "",
    );
  if (!cleaned) return null;
  if (!/^[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2}$/.test(cleaned)) {
    return null;
  }
  if (["I", "Im", "I'm", "My", "Me"].includes(cleaned)) return null;
  return cleaned;
}

export function extractPrimaryUserFromCast(storyState: string): string | null {
  const castSection = storyState.match(/##\s*Cast\b([\s\S]*?)(?=\n##\s+|$)/i);
  if (!castSection) return null;
  const castBody = castSection[1] ?? "";
  if (!castBody) return null;

  const playerLine = castBody.match(
    /^\s*-\s+\*\*(.+?)\*\*.*\[player character\]/im,
  );
  if (playerLine?.[1]) return normalizeAlias(playerLine[1]);

  const nameMatches = [...castBody.matchAll(/^\s*-\s+\*\*(.+?)\*\*/gm)];
  const secondMember = nameMatches[1]?.[1];
  if (!secondMember) return null;
  return normalizeAlias(secondMember);
}

/**
 * Extract the player name from the critical `player_identity` segment
 * that was generated at story launch time.
 */
export function extractPlayerFromSegments(
  segments: SerializedSegment[] | null | undefined,
): string | null {
  if (!segments) return null;
  const seg = segments.find((s) => s.id === "player_identity");
  if (!seg?.content) return null;
  const match = seg.content.match(/The player character is called "(.+?)"/);
  return match?.[1] ?? null;
}

export function buildRuntimePlayerBoundary(
  primaryUserAlias: string | null,
): string {
  const identityClause = primaryUserAlias
    ? `- There is exactly ONE primary user character in this session: "${primaryUserAlias}".\n- Treat only "${primaryUserAlias}" as {{ user }}. All other named characters are NPCs unless explicitly changed in story state.`
    : "- There is exactly ONE primary user character, but it could not be resolved from Cast.\n- Until Cast is resolved, treat ambiguous identity as player-controlled and avoid writing for that character.";

  return [
    "## Player Control Boundary (Critical)",
    "- The Cast member tagged [player character] is the canonical {{ user }} identity.",
    identityClause,
    "- NEVER write dialogue, actions, thoughts, decisions, intentions, or internal state for the player-controlled entity.",
    "- NEVER decide what the player says, does, feels, notices, or concludes.",
    "- If a sentence would make the player-controlled character the subject of a new action or thought, do not write it.",
    "- If identity is ambiguous, ask an in-world clarifying question and continue with NPC/environment narration only.",
  ].join("\n");
}
