-- ConversationNote table for LLM working memory (note_to_self tool)
CREATE TABLE "ConversationNote" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX "ConversationNote_conversationId_createdAt_idx"
  ON "ConversationNote" ("conversationId", "createdAt");