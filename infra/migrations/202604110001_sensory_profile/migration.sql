-- Add sensoryProfile column to StoryCharacter
ALTER TABLE "StoryCharacter" ADD COLUMN IF NOT EXISTS "sensoryProfile" JSONB;

-- Remove vibe entries from existing appearance JSON arrays
UPDATE "StoryCharacter"
SET "appearance" = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements("appearance") AS elem
  WHERE elem->>'attribute' != 'vibe'
)
WHERE "appearance" IS NOT NULL
  AND "appearance" @> '[{"attribute": "vibe"}]';