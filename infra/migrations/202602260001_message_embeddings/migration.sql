-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Message pair embeddings for RAG retrieval
CREATE TABLE "MessageEmbedding" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "turnIndex" INT NOT NULL,
  "userText" TEXT NOT NULL,
  "assistantText" TEXT NOT NULL,
  "combinedText" TEXT NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Index for fast similarity search within a conversation
CREATE INDEX "MessageEmbedding_conversationId_idx"
  ON "MessageEmbedding" ("conversationId");

-- HNSW index for approximate nearest neighbor search
CREATE INDEX "MessageEmbedding_embedding_idx"
  ON "MessageEmbedding"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Prevent duplicate embeddings for the same turn
CREATE UNIQUE INDEX "MessageEmbedding_conversation_turn_idx"
  ON "MessageEmbedding" ("conversationId", "turnIndex");
