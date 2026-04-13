-- AddSlowLaneTracking
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastSlowLaneAt" TIMESTAMPTZ(6);
