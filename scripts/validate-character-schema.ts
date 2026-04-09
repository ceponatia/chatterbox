import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Paths (relative to workspace root)
// ---------------------------------------------------------------------------

const PRISMA_SCHEMA_PATH = resolve("infra/schema.prisma");
const CHARACTER_SCHEMA_PATH = resolve("apps/web/src/lib/character-schema.ts");

// ---------------------------------------------------------------------------
// Prisma: extract StoryCharacter field names
// ---------------------------------------------------------------------------

function extractPrismaFields(schemaContent: string): string[] {
  const modelMatch = schemaContent.match(
    /model\s+StoryCharacter\s*\{([\s\S]*?)\n\}/,
  );
  if (!modelMatch?.[1]) {
    throw new Error("StoryCharacter model not found in Prisma schema");
  }

  const body = modelMatch[1];
  const fields: string[] = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) {
      continue;
    }
    const fieldMatch = trimmed.match(/^(\w+)\s+/);
    if (fieldMatch?.[1]) {
      fields.push(fieldMatch[1]);
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// UI schema: extract field keys from CHARACTER_TABS
// ---------------------------------------------------------------------------

function extractUiFieldKeys(schemaContent: string): string[] {
  const keys: string[] = [];
  const keyPattern = /key:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = keyPattern.exec(schemaContent)) !== null) {
    if (match[1]) {
      keys.push(match[1]);
    }
  }

  return [...new Set(keys)];
}

// ---------------------------------------------------------------------------
// Hardcoded mapping: UI field key -> Prisma column
// ---------------------------------------------------------------------------

const UI_KEY_TO_PRISMA_COLUMN: Record<string, string> = {
  // Identity tab -> identity Json column (plus name/role direct columns)
  name: "name",
  role: "role",
  roleTitle: "identity",
  age: "identity",
  pronouns: "identity",
  species: "identity",
  situation: "identity",

  // Background section -> background String column
  background: "background",

  // Appearance tab -> appearance Json column
  appearance: "appearance",

  // Behavior tab -> behavioralProfile Json column
  overview: "behavioralProfile",
  speechPatterns: "behavioralProfile",
  vocabulary: "behavioralProfile",
  emotionalTexture: "behavioralProfile",
  withPlayer: "behavioralProfile",
  commonMistakes: "behavioralProfile",
  mannerisms: "behavioralProfile",

  // Demeanor tab -> startingDemeanor String column
  startingDemeanor: "startingDemeanor",
};

// Structured Prisma fields that should have UI coverage
const STRUCTURED_PRISMA_FIELDS = [
  "identity",
  "background",
  "appearance",
  "behavioralProfile",
  "startingDemeanor",
] as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate() {
  const prismaContent = readFileSync(PRISMA_SCHEMA_PATH, "utf-8");
  const schemaContent = readFileSync(CHARACTER_SCHEMA_PATH, "utf-8");

  const prismaFields = extractPrismaFields(prismaContent);
  const uiFieldKeys = extractUiFieldKeys(schemaContent);

  let passed = true;

  // Check a: every structured Prisma field has at least one UI field key
  console.log("\n--- Prisma structured fields -> UI coverage ---\n");

  for (const prismaField of STRUCTURED_PRISMA_FIELDS) {
    if (!prismaFields.includes(prismaField)) {
      console.log(
        `  \x1b[31m✗\x1b[0m  ${prismaField} — missing from Prisma schema`,
      );
      passed = false;
      continue;
    }

    const mappedKeys = Object.entries(UI_KEY_TO_PRISMA_COLUMN)
      .filter(([, col]) => col === prismaField)
      .map(([key]) => key);

    const coveredKeys = mappedKeys.filter((k) => uiFieldKeys.includes(k));

    if (coveredKeys.length > 0) {
      console.log(
        `  \x1b[32m✓\x1b[0m  ${prismaField} — covered by: ${coveredKeys.join(", ")}`,
      );
    } else {
      console.log(
        `  \x1b[31m✗\x1b[0m  ${prismaField} — no UI field keys found (expected one of: ${mappedKeys.join(", ") || "none mapped"})`,
      );
      passed = false;
    }
  }

  // Check b: every UI field key maps to a known Prisma column
  console.log("\n--- UI field keys -> Prisma column mapping ---\n");

  for (const uiKey of uiFieldKeys) {
    const prismaColumn = UI_KEY_TO_PRISMA_COLUMN[uiKey];
    if (prismaColumn) {
      console.log(`  \x1b[32m✓\x1b[0m  ${uiKey} -> ${prismaColumn}`);
    } else {
      console.log(`  \x1b[31m✗\x1b[0m  ${uiKey} — no Prisma column mapping`);
      passed = false;
    }
  }

  console.log("");

  if (passed) {
    console.log("\x1b[32mAll schema alignment checks passed.\x1b[0m\n");
    process.exit(0);
  } else {
    console.log(
      "\x1b[31mSchema alignment validation failed. Update the mapping or fix mismatches above.\x1b[0m\n",
    );
    process.exit(1);
  }
}

validate();
