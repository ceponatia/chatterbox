-- CreateTable: StoryLocation
CREATE TABLE "StoryLocation" (
    "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "storyProjectId" UUID NOT NULL REFERENCES "StoryProject"("id") ON DELETE CASCADE,
    "name"           TEXT NOT NULL,
    "description"    TEXT NOT NULL DEFAULT '',
    "tags"           TEXT[] NOT NULL DEFAULT '{}',
    "atmosphere"     TEXT NOT NULL DEFAULT '',
    "sortOrder"      INT NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updatedAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX "StoryLocation_storyProjectId_idx" ON "StoryLocation"("storyProjectId");

-- CreateTable: LocationConnection
CREATE TABLE "LocationConnection" (
    "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "fromLocationId"  UUID NOT NULL REFERENCES "StoryLocation"("id") ON DELETE CASCADE,
    "toLocationId"    UUID NOT NULL REFERENCES "StoryLocation"("id") ON DELETE CASCADE,
    "description"     TEXT,
    "bidirectional"   BOOLEAN NOT NULL DEFAULT true,
    "traversalHint"   TEXT,
    "createdAt"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updatedAt"       TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX "LocationConnection_fromLocationId_idx" ON "LocationConnection"("fromLocationId");
CREATE INDEX "LocationConnection_toLocationId_idx" ON "LocationConnection"("toLocationId");

-- AlterTable: StoryCharacter - add defaultLocationId
ALTER TABLE "StoryCharacter" ADD COLUMN "defaultLocationId" UUID;
