-- CreateTable
CREATE TABLE "SettingsPreset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "SettingsPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettingsPreset_userId_idx" ON "SettingsPreset"("userId");

-- AddForeignKey
ALTER TABLE "SettingsPreset" ADD CONSTRAINT "SettingsPreset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed built-in presets for existing users
-- Admin user: a99685fa-2691-43b9-b0ac-fedbdba970a7
-- Local dev user: 00000000-0000-0000-0000-000000000000

-- Creative preset (higher temperature, slight frequency penalty)
INSERT INTO "SettingsPreset" ("id", "userId", "name", "settings", "isDefault", "createdAt", "updatedAt")
VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a99685fa-2691-43b9-b0ac-fedbdba970a7', 'Creative',
   '{"model":"z-ai/glm-5","temperature":1.0,"maxTokens":1500,"topP":1,"frequencyPenalty":0.3,"presencePenalty":0,"autoSummarizeInterval":15,"tokenBudget":5000}',
   false, now(), now()),
  ('b0000001-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Creative',
   '{"model":"z-ai/glm-5","temperature":1.0,"maxTokens":1500,"topP":1,"frequencyPenalty":0.3,"presencePenalty":0,"autoSummarizeInterval":15,"tokenBudget":5000}',
   false, now(), now());

-- Balanced preset (current defaults, marked as default)
INSERT INTO "SettingsPreset" ("id", "userId", "name", "settings", "isDefault", "createdAt", "updatedAt")
VALUES
  ('b0000001-0000-0000-0000-000000000003', 'a99685fa-2691-43b9-b0ac-fedbdba970a7', 'Balanced',
   '{"model":"z-ai/glm-5","temperature":0.85,"maxTokens":1500,"topP":1,"frequencyPenalty":0,"presencePenalty":0,"autoSummarizeInterval":15,"tokenBudget":5000}',
   true, now(), now()),
  ('b0000001-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'Balanced',
   '{"model":"z-ai/glm-5","temperature":0.85,"maxTokens":1500,"topP":1,"frequencyPenalty":0,"presencePenalty":0,"autoSummarizeInterval":15,"tokenBudget":5000}',
   true, now(), now());

-- Precise preset (lower temperature, higher frequency penalty)
INSERT INTO "SettingsPreset" ("id", "userId", "name", "settings", "isDefault", "createdAt", "updatedAt")
VALUES
  ('b0000001-0000-0000-0000-000000000005', 'a99685fa-2691-43b9-b0ac-fedbdba970a7', 'Precise',
   '{"model":"z-ai/glm-5","temperature":0.6,"maxTokens":1500,"topP":1,"frequencyPenalty":0.5,"presencePenalty":0,"autoSummarizeInterval":15,"tokenBudget":5000}',
   false, now(), now()),
  ('b0000001-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'Precise',
   '{"model":"z-ai/glm-5","temperature":0.6,"maxTokens":1500,"topP":1,"frequencyPenalty":0.5,"presencePenalty":0,"autoSummarizeInterval":15,"tokenBudget":5000}',
   false, now(), now());