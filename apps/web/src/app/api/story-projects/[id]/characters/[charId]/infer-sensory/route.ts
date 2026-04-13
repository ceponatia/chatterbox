import { generateText } from "ai";
import {
  logRequest,
  logError,
  logResponse,
  startTimer,
} from "@/lib/api-logger";
import { env } from "@/lib/env";
import { getUserId } from "@/lib/get-user-id";
import { openrouter } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import {
  validateSensoryProfile,
  type SensoryProfile,
  type SensoryOverview,
  type SensoryAttributeNote,
} from "@/lib/sensory-schema";
import { getStoryProjectRow } from "@/lib/story-project-db";

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

interface InferSensoryInput {
  lockedOverallFields?: string[];
  lockedAttributeFields?: Record<string, string[]>;
  currentProfile?: SensoryProfile | null;
}

// ---------------------------------------------------------------------------
// Character data helpers
// ---------------------------------------------------------------------------

interface CharacterIdentityData {
  age?: string;
  role?: string;
  situation?: string;
  pronouns?: string;
  species?: string;
}

interface CharacterAppearanceEntry {
  attribute: string;
  value: string;
}

interface CharacterBehavioralData {
  overview?: string;
}

const IDENTITY_FIELDS: (keyof CharacterIdentityData)[] = [
  "role",
  "age",
  "species",
  "situation",
  "pronouns",
];

function formatIdentity(
  lines: string[],
  identity: CharacterIdentityData | null,
): void {
  if (!identity) return;
  for (const key of IDENTITY_FIELDS) {
    const value = identity[key];
    if (value)
      lines.push(`${key.charAt(0).toUpperCase()}${key.slice(1)}: ${value}`);
  }
}

function buildCharacterContext(character: {
  name: string;
  identity: unknown;
  background: string | null;
  appearance: unknown;
  behavioralProfile: unknown;
}): string {
  const lines: string[] = [];

  lines.push(`Character: ${character.name}`);

  formatIdentity(lines, character.identity as CharacterIdentityData | null);

  if (character.background) {
    lines.push(`\nBackground:\n${character.background}`);
  }

  const appearance = character.appearance as CharacterAppearanceEntry[] | null;
  if (appearance?.length) {
    lines.push("\nAppearance:");
    for (const entry of appearance) {
      if (entry.attribute && entry.value) {
        lines.push(`- ${entry.attribute}: ${entry.value}`);
      }
    }
  }

  const behavioral =
    character.behavioralProfile as CharacterBehavioralData | null;
  if (behavioral?.overview) {
    lines.push(`\nBehavioral overview:\n${behavioral.overview}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are a creative writing assistant specializing in vivid sensory " +
  "character descriptions for roleplay. You produce specific, concrete, " +
  "grounded sensory details -- not generic or vague descriptions. Ground " +
  "every detail in the character's lifestyle, background, species, and " +
  "environment.";

function buildUserPrompt(
  characterContext: string,
  lockedOverall: string[],
  lockedAttributes: Record<string, string[]>,
): string {
  const overallFields = ["scent", "texture", "taste"].filter(
    (f) => !lockedOverall.includes(f),
  );
  const lockedOverallNote =
    lockedOverall.length > 0
      ? `\nDo not include ${lockedOverall.join(", ")} field(s) in the overall section -- they have been set by the user.`
      : "";

  const lockedAttrNotes: string[] = [];
  for (const [attr, fields] of Object.entries(lockedAttributes)) {
    if (fields.length > 0) {
      lockedAttrNotes.push(
        `For the "${attr}" attribute, do not include ${fields.join(", ")} -- set by the user.`,
      );
    }
  }
  const lockedAttrSection =
    lockedAttrNotes.length > 0 ? `\n${lockedAttrNotes.join("\n")}` : "";

  return `${characterContext}

Based on this character, generate a sensory profile as a JSON object with this exact structure:

{
  "overall": {
    ${overallFields.map((f) => `"${f}": "character's overall ${f} -- be specific and grounded in their lifestyle"`).join(",\n    ")}
  }${lockedOverallNote},
  "attributes": [
    // For each PHYSICAL appearance attribute listed above, provide sensory notes.
    // Only include attributes where sensory data makes sense.
    // If an attribute is not a physical characteristic that would have scent, texture, or taste, omit it entirely.
    // Exclude voice from sensory attribute rows.
    {
      "attribute": "attribute name exactly as listed above",
      "scent": "scent specific to this attribute, or omit if not applicable",
      "texture": "texture specific to this attribute, or omit if not applicable",
      "taste": "taste specific to this attribute, or omit if not applicable"
    }
  ]
}${lockedAttrSection}

Return ONLY the JSON object. No markdown fences, no explanation.`;
}

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

function extractJson(text: string): unknown | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Look for a JSON block in the text
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lock merging
// ---------------------------------------------------------------------------

function mergeLockedFields(
  inferred: SensoryProfile,
  current: SensoryProfile | null | undefined,
  lockedOverall: string[],
  lockedAttributes: Record<string, string[]>,
): SensoryProfile {
  if (!current) return inferred;

  const overall: SensoryOverview = { ...inferred.overall };
  for (const field of lockedOverall) {
    const key = field as keyof SensoryOverview;
    if (key in current.overall) {
      (overall as Record<string, unknown>)[key] = current.overall[key];
    }
  }

  const attributes: SensoryAttributeNote[] = inferred.attributes.map((attr) => {
    const lockedFields = lockedAttributes[attr.attribute];
    if (!lockedFields?.length) return attr;

    const currentAttr = current.attributes.find(
      (a) => a.attribute === attr.attribute,
    );
    if (!currentAttr) return attr;

    const merged: SensoryAttributeNote = { ...attr };
    for (const field of lockedFields) {
      const key = field as keyof SensoryAttributeNote;
      if (key in currentAttr) {
        (merged as unknown as Record<string, unknown>)[key] = currentAttr[key];
      }
    }
    return merged;
  });

  return { overall, attributes };
}

// ---------------------------------------------------------------------------
// Parse optional body
// ---------------------------------------------------------------------------

interface ParsedLockInfo {
  lockedOverall: string[];
  lockedAttributes: Record<string, string[]>;
  currentProfile: SensoryProfile | null;
}

async function parseLockInfo(request: Request): Promise<ParsedLockInfo> {
  try {
    const body = (await request.json()) as InferSensoryInput | null;
    return {
      lockedOverall: body?.lockedOverallFields ?? [],
      lockedAttributes: body?.lockedAttributeFields ?? {},
      currentProfile: body?.currentProfile ?? null,
    };
  } catch {
    // Empty body is fine -- all fields are optional
    return { lockedOverall: [], lockedAttributes: {}, currentProfile: null };
  }
}

// ---------------------------------------------------------------------------
// LLM call + parse
// ---------------------------------------------------------------------------

async function callInferenceModel(
  userPrompt: string,
): Promise<{ profile: SensoryProfile } | { error: string }> {
  const elapsed = startTimer();

  console.log(
    `[infer-sensory] Starting LLM call | model=${env.SENSORY_INFERENCE_MODEL} | prompt length=${userPrompt.length} chars`,
  );

  const result = await generateText({
    model: openrouter(env.SENSORY_INFERENCE_MODEL),
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

  const elapsedMs = elapsed();

  console.log(
    `[infer-sensory] LLM call returned | elapsed=${elapsedMs}ms | text length=${result.text.length} | finishReason=${result.finishReason} | usage=${JSON.stringify(result.usage)}`,
  );
  console.log(`[infer-sensory] Response preview: ${result.text.slice(0, 500)}`);

  logResponse(
    "/api/story-projects/[id]/characters/[charId]/infer-sensory",
    elapsedMs,
    result.text,
  );

  const parsed = extractJson(result.text);
  if (!parsed) {
    console.warn(
      `[infer-sensory] JSON extraction FAILED | raw text:\n${result.text}`,
    );
    logError("Sensory inference: failed to parse/validate response");
    return { error: "Failed to parse inference response" };
  }
  console.log(`[infer-sensory] JSON extraction succeeded`);

  if (!validateSensoryProfile(parsed)) {
    console.warn(
      `[infer-sensory] Validation FAILED | parsed object: ${JSON.stringify(parsed, null, 2)}`,
    );
    logError("Sensory inference: failed to parse/validate response");
    return { error: "Failed to parse inference response" };
  }
  console.log(`[infer-sensory] Validation passed`);

  return { profile: parsed };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  const { id, charId } = await params;
  logRequest("/api/story-projects/[id]/characters/[charId]/infer-sensory", {
    method: "POST",
    id,
    charId,
  });

  const userId = getUserId(request);

  const project = await getStoryProjectRow(prisma, userId, id);
  const character = project?.characters.find((c) => c.id === charId);
  if (!project || !character) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { lockedOverall, lockedAttributes, currentProfile } =
    await parseLockInfo(request);

  const characterContext = buildCharacterContext(character);
  const userPrompt = buildUserPrompt(
    characterContext,
    lockedOverall,
    lockedAttributes,
  );

  try {
    const result = await callInferenceModel(userPrompt);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const profile = mergeLockedFields(
      result.profile,
      currentProfile,
      lockedOverall,
      lockedAttributes,
    );

    return Response.json(profile);
  } catch (error) {
    logError("Sensory inference failed", error);
    const message =
      error instanceof Error ? error.message : "Inference request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
