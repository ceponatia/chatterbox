ALTER TABLE "StoryCharacter" ADD COLUMN "isPlayer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoryCharacter" ADD COLUMN "identity" JSONB;
ALTER TABLE "StoryCharacter" ADD COLUMN "background" TEXT;
ALTER TABLE "StoryCharacter" ADD COLUMN "appearance" JSONB;
ALTER TABLE "StoryCharacter" ADD COLUMN "behavioralProfile" JSONB;
ALTER TABLE "StoryCharacter" ADD COLUMN "startingDemeanor" TEXT;

CREATE UNIQUE INDEX "StoryCharacter_storyProjectId_isPlayer_key"
ON "StoryCharacter" ("storyProjectId")
WHERE "isPlayer" = true;
