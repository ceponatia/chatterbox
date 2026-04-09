-- Add segmentOverrides column to StoryProject for user-customized system prompt fields
ALTER TABLE "StoryProject" ADD COLUMN "segmentOverrides" JSONB;
