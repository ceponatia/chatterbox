CREATE TABLE "StoryProject" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "authoringMode" TEXT NOT NULL DEFAULT 'form',
  "importedSystemPrompt" TEXT,
  "importedStoryState" TEXT,
  "generatedSystemPrompt" TEXT NOT NULL DEFAULT '',
  "generatedStoryState" TEXT NOT NULL DEFAULT '',
  "generatedSegments" JSONB,
  "generatedStructuredState" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "StoryProject_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StoryProject_userId_idx" ON "StoryProject" ("userId");

CREATE TABLE "StoryCharacter" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "storyProjectId" UUID NOT NULL,
  "entityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'supporting',
  "importedMarkdown" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "StoryCharacter_storyProjectId_fkey"
    FOREIGN KEY ("storyProjectId") REFERENCES "StoryProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoryCharacter_storyProjectId_idx" ON "StoryCharacter" ("storyProjectId");
CREATE UNIQUE INDEX "StoryCharacter_storyProjectId_entityId_key" ON "StoryCharacter" ("storyProjectId", "entityId");

CREATE TABLE "StoryRelationship" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "storyProjectId" UUID NOT NULL,
  "fromEntityId" TEXT NOT NULL,
  "toEntityId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "tone" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "StoryRelationship_storyProjectId_fkey"
    FOREIGN KEY ("storyProjectId") REFERENCES "StoryProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoryRelationship_storyProjectId_idx" ON "StoryRelationship" ("storyProjectId");

ALTER TABLE "Conversation" ADD COLUMN "storyProjectId" UUID;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_storyProjectId_fkey"
  FOREIGN KEY ("storyProjectId") REFERENCES "StoryProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Conversation_storyProjectId_idx" ON "Conversation" ("storyProjectId");

CREATE OR REPLACE FUNCTION "set_story_project_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StoryProject_set_updatedAt"
BEFORE UPDATE ON "StoryProject"
FOR EACH ROW
EXECUTE FUNCTION "set_story_project_updated_at"();

CREATE TRIGGER "StoryCharacter_set_updatedAt"
BEFORE UPDATE ON "StoryCharacter"
FOR EACH ROW
EXECUTE FUNCTION "set_story_project_updated_at"();

CREATE TRIGGER "StoryRelationship_set_updatedAt"
BEFORE UPDATE ON "StoryRelationship"
FOR EACH ROW
EXECUTE FUNCTION "set_story_project_updated_at"();