CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "Conversation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromptConfig" (
  "conversationId" UUID NOT NULL,
  "systemPrompt" TEXT NOT NULL,
  "systemPromptBaseline" TEXT,
  "customSegments" JSONB,
  "lastIncludedAt" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "tokenBudget" INTEGER NOT NULL DEFAULT 2500,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "PromptConfig_pkey" PRIMARY KEY ("conversationId"),
  CONSTRAINT "PromptConfig_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
