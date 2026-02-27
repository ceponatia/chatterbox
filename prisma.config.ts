import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "infra/schema.prisma",
  migrations: {
    path: "infra/migrations",
  },
});
