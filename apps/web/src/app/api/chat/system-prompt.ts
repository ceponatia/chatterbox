import type { SerializedSegment } from "@chatterbox/prompt-assembly";

export type SystemPromptMessage = {
  role: "system";
  content: string;
  providerOptions?: Record<string, Record<string, unknown>>;
};

const TOOL_GUIDANCE_ENTRIES: Array<{
  tools: readonly string[];
  matchAny?: boolean;
  text: string;
}> = [
  // Retrieval tools
  {
    tools: ["get_facts", "get_threads"],
    matchAny: true,
    text: "- Use get_facts or get_threads for targeted retrieval of story context.",
  },
  {
    tools: ["get_relationships"],
    text: "- Use get_relationships to retrieve character relationships. Pass fromName/toName for a specific pair, one name for all involving that character, or no names for all. Use compact=true for quick checks.",
  },
  {
    tools: ["get_story_context"],
    text: "- Use get_story_context when you need facts, relationships, and threads together.",
  },
  {
    tools: ["get_backstory"],
    text: "- Use get_backstory to retrieve character background. Use section or keywords params for targeted lookup.",
  },
  {
    tools: ["get_character_details"],
    text: "- Use get_character_details for each present character's appearance, voice, mannerisms, and personality. Full detail is returned by default.",
  },
  {
    tools: ["get_interaction_guidelines"],
    text: "- Use get_interaction_guidelines for interaction style and approach guidance.",
  },
  // Scene & entity tools
  {
    tools: ["get_scene_context"],
    text: "- Use get_scene_context to check current scene, location, and who is present.",
  },
  {
    tools: ["lookup_entity"],
    text: "- Use lookup_entity when you need details about a specific character.",
  },
  {
    tools: ["search_history"],
    text: "- Use search_history to recall specific past events or earlier conversation details.",
  },
  // Location tools
  {
    tools: ["get_location_details"],
    text: "- Use get_location_details for information about a specific location.",
  },
  {
    tools: ["get_nearby_locations"],
    text: "- Use get_nearby_locations to see reachable locations from the current position.",
  },
  {
    tools: ["move_to_location"],
    text: "- Use move_to_location to transition the scene to a different location.",
  },
  // Working memory tools
  {
    tools: ["note_to_self"],
    text: "- Use note_to_self to persist important inferences, hypotheses, or tracking details across turns.",
  },
];

export function buildToolsInstruction(
  toolNames: readonly string[],
  includedSegmentIds?: readonly string[],
): string {
  const nameSet = new Set(toolNames);
  const lines: string[] = ["## Tool Usage"];

  for (const entry of TOOL_GUIDANCE_ENTRIES) {
    const matches = entry.matchAny
      ? entry.tools.some((t) => nameSet.has(t))
      : nameSet.has(entry.tools[0]!);
    if (matches) lines.push(entry.text);
  }

  // General guidance
  lines.push(
    "- Follow the Turn Procedure checkpoints to determine which tools to call each turn.",
    "- get_character_details returns full detail by default. Call it for each present character as the procedure directs.",
    "- If details are not needed for the current turn, respond without calling tools.",
  );

  // Assembly manifest
  if (includedSegmentIds && includedSegmentIds.length > 0) {
    lines.push(
      "",
      "## Already in context",
      `Prompt segments included this turn: ${includedSegmentIds.join(", ")}`,
      "- The segments above are already in your instructions. Do not use tools to re-retrieve content covered by these segments.",
      "- Tool-retrievable data (character details, relationships, facts, scene context, history) is always available via tools. Call tools when the Turn Procedure directs you to, even if a related segment is listed above.",
    );
  }

  return lines.join("\n");
}

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
  toolNames?: readonly string[],
  includedSegmentIds?: readonly string[],
): SystemPromptMessage[] {
  const toolGuidance =
    toolUseEnabled && toolNames
      ? buildToolsInstruction(toolNames, includedSegmentIds)
      : null;
  const promptContent = toolGuidance
    ? `${assemblyPrompt}\n\n${toolGuidance}`
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
