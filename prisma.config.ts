import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "infra/schema.prisma",
  migrations: {
    path: "infra/migrations",
  },
  datasource: {
    provider: "postgresql",
    url:
      process.env.DATABASE_URL ??
      "postgresql://chatterbox:chatterbox@localhost:5432/chatterbox",
  },
});
