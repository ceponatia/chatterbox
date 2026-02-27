import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env, getBaseUrl } from "@/lib/env";

export const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": getBaseUrl(),
    "X-Title": "Chatterbox",
  },
  extraBody: {
    zdr: false,
  },
});
