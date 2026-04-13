-- BackstorySection table for structured backstory retrieval
-- Uses pgvector for semantic search over backstory content
CREATE TABLE "BackstorySection" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "characterId" UUID NOT NULL REFERENCES "StoryCharacter"("id") ON DELETE CASCADE,
  "sectionName" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1536),
  "order" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX "BackstorySection_characterId_idx"
  ON "BackstorySection" ("characterId");

-- HNSW index for approximate nearest neighbor search on backstory embeddings
CREATE INDEX "BackstorySection_embedding_idx"
  ON "BackstorySection"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);