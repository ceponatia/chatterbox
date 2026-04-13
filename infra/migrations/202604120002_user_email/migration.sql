-- Add optional email column to User
ALTER TABLE "User" ADD COLUMN "email" TEXT;

-- Create unique index on email (partial -- only non-null values)
CREATE UNIQUE INDEX "User_email_key" ON "User" ("email") WHERE "email" IS NOT NULL;