ALTER TABLE "Conversation"
  ADD COLUMN "messages" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "systemPrompt" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "storyState" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "previousStoryState" TEXT,
  ADD COLUMN "storyStateLastUpdated" TIMESTAMPTZ,
  ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "systemPromptBaseline" TEXT,
  ADD COLUMN "storyStateBaseline" TEXT,
  ADD COLUMN "lastIncludedAt" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "customSegments" JSONB,
  ADD COLUMN "structuredState" JSONB;

DROP TABLE "PromptConfig";
