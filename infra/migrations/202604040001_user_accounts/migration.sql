-- Create User table
CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "User_username_key" ON "User" ("username");

-- Seed admin user (password: yurikml2, bcrypt cost 10)
INSERT INTO "User" ("id", "username", "passwordHash", "createdAt")
VALUES (
  gen_random_uuid(),
  'admin',
  '$2b$10$j7cLAAzc0J0XSux9iNW6Ge76UEjX23R7O4zZtG1M/UUFWys35KpEC',
  now()
);

-- Add userId to Conversation
ALTER TABLE "Conversation" ADD COLUMN "userId" UUID;

-- Backfill all existing conversations to admin
UPDATE "Conversation"
SET "userId" = (SELECT "id" FROM "User" WHERE "username" = 'admin');

-- Make userId NOT NULL and add FK + index
ALTER TABLE "Conversation" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id");
CREATE INDEX "Conversation_userId_idx" ON "Conversation" ("userId");

-- Add userId to MessageEmbedding
ALTER TABLE "MessageEmbedding" ADD COLUMN "userId" UUID;

-- Backfill existing embeddings to admin
UPDATE "MessageEmbedding"
SET "userId" = (SELECT "id" FROM "User" WHERE "username" = 'admin');

-- Make NOT NULL and add FK
ALTER TABLE "MessageEmbedding" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "MessageEmbedding"
  ADD CONSTRAINT "MessageEmbedding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id");
