INSERT INTO "User" ("id", "username", "passwordHash", "createdAt")
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'local-dev',
  '$2b$10$placeholder000000000000000000000000000000000000000000',
  now()
)
ON CONFLICT ("id") DO NOTHING;