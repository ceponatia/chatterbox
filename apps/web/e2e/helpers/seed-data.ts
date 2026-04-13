import { execSync } from "node:child_process";
import path from "node:path";

const ROOT_DIR = path.resolve(__dirname, "../../../..");

const E2E_DB_URL =
  "postgresql://chatterbox:chatterbox@localhost:55432/chatterbox_e2e";

export function ensureE2eDatabase(): void {
  try {
    execSync(
      `psql "postgresql://chatterbox:chatterbox@localhost:55432/postgres" -tc "SELECT 1 FROM pg_database WHERE datname = 'chatterbox_e2e'" | grep -q 1 || psql "postgresql://chatterbox:chatterbox@localhost:55432/postgres" -c "CREATE DATABASE chatterbox_e2e"`,
      { stdio: "pipe" },
    );
  } catch {
    // Database creation is idempotent; if the database already exists or psql reports a race, continue to migrations.
  }

  const migrateEnv = { ...process.env, DATABASE_URL: E2E_DB_URL };

  try {
    execSync("pnpm exec prisma migrate deploy", {
      cwd: ROOT_DIR,
      stdio: "pipe",
      env: migrateEnv,
    });
  } catch {
    // The e2e database is disposable. If any migration fails (stuck, partially
    // applied, schema drift), drop and recreate for a clean slate.
    try {
      execSync(
        `psql "postgresql://chatterbox:chatterbox@localhost:55432/postgres" -c "DROP DATABASE IF EXISTS chatterbox_e2e" -c "CREATE DATABASE chatterbox_e2e"`,
        { stdio: "pipe" },
      );
      execSync("pnpm exec prisma migrate deploy", {
        cwd: ROOT_DIR,
        stdio: "pipe",
        env: migrateEnv,
      });
    } catch (resetErr) {
      throw new Error(
        `E2E database setup failed after reset: ${resetErr instanceof Error ? resetErr.message : String(resetErr)}`,
      );
    }
  }
}
