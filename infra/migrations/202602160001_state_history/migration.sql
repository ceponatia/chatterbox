ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "lastSummarizedTurn" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastPipelineTurn" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "StateHistoryEntry" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "timestamp" TIMESTAMPTZ(6) NOT NULL,
  "turnStart" INTEGER NOT NULL,
  "turnEnd" INTEGER NOT NULL,
  "previousState" TEXT NOT NULL,
  "newState" TEXT NOT NULL,
  "extractedFacts" JSONB NOT NULL,
  "validation" JSONB NOT NULL,
  "disposition" TEXT NOT NULL,

  CONSTRAINT "StateHistoryEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StateHistoryEntry_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StateHistoryEntry_conversationId_timestamp_idx"
  ON "StateHistoryEntry" ("conversationId", "timestamp");
