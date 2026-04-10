-- AlterTable
ALTER TABLE "StoryProject" ADD COLUMN "mainEntityId" TEXT,
ADD COLUMN "promptBlueprint" JSONB,
ADD COLUMN "runtimeSeed" JSONB;
