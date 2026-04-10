-- AlterTable: add state refresh tracking fields
ALTER TABLE "Conversation"
  ADD COLUMN "lastStateUpdateAt" TIMESTAMPTZ(6),
  ADD COLUMN "lastStateCheckpointMessageId" TEXT,
  ADD COLUMN "stateRefreshLeaseExpiresAt" TIMESTAMPTZ(6),
  ADD COLUMN "candidateFacts" JSONB;
