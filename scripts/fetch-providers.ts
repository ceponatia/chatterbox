const MODEL_IDS = [
  "z-ai/glm-5",
  "google/gemini-3.1-pro-preview",
  "qwen/qwen3.5-plus-02-15",
  "deepseek/deepseek-v3.2",
  "x-ai/grok-4.1-fast",
  "openai/gpt-oss-120b",
] as const;

interface Endpoint {
  provider_name?: string;
}

interface EndpointResponse {
  data?: {
    endpoints?: Endpoint[];
  };
}

async function fetchProviderOrder(modelId: string): Promise<string[]> {
  const res = await fetch(
    `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
  );
  if (!res.ok) {
    throw new Error(`${modelId}: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as EndpointResponse;
  const providers = json.data?.endpoints ?? [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const endpoint of providers) {
    const name = endpoint.provider_name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

async function main() {
  const out: Record<string, string[]> = {};
  for (const modelId of MODEL_IDS) {
    out[modelId] = await fetchProviderOrder(modelId);
  }
  console.log(JSON.stringify(out, null, 2));
}

void main();
