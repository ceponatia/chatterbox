import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env, getBaseUrl } from "@/lib/env";

const sharedConfig = {
  apiKey: env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": getBaseUrl(),
    "X-Title": "Chatterbox",
  },
  extraBody: {
    zdr: false,
  },
} as const;

export const openrouter = createOpenRouter(sharedConfig);
