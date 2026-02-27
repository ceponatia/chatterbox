export const env = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "z-ai/glm-5",
  FACT_EXTRACTION_MODEL:
    process.env.FACT_EXTRACTION_MODEL || "google/gemini-2.0-flash-001",
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://chatterbox:chatterbox@localhost:5432/chatterbox",
  PORT: process.env.PORT || "3000",
  LOG_LEVEL: (process.env.LOG_LEVEL || "info").toLowerCase(),
  NODE_ENV: process.env.NODE_ENV || "development",
} as const;

export function getBaseUrl() {
  return `http://localhost:${env.PORT}`;
}
