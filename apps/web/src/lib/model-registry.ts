export interface ModelEntry {
  id: string;
  label: string;
  providers: string[];
}

export const DEFAULT_MODEL_ID = "z-ai/glm-5";

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    id: "z-ai/glm-5",
    label: "GLM 5",
    providers: [
      "SiliconFlow",
      "AtlasCloud",
      "Friendli",
      "GMICloud",
      "Parasail",
      "Venice",
      "Novita",
      "Together",
      "Z.AI",
      "Fireworks",
      "Phala",
    ],
  },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    providers: ["Google", "Google AI Studio"],
  },
  {
    id: "qwen/qwen3.5-plus-02-15",
    label: "Qwen 3.5 Plus",
    providers: ["Alibaba"],
  },
  {
    id: "deepseek/deepseek-v3.2",
    label: "DeepSeek V3.2",
    providers: [
      "DeepInfra",
      "AtlasCloud",
      "Novita",
      "SiliconFlow",
      "DeepSeek",
      "Parasail",
      "Google",
    ],
  },
  {
    id: "x-ai/grok-4.1-fast",
    label: "Grok 4.1 Fast",
    providers: ["xAI"],
  },
  {
    id: "openai/gpt-oss-120b",
    label: "GPT OSS 120B",
    providers: [
      "DeepInfra",
      "Chutes",
      "Novita",
      "SiliconFlow",
      "Clarifai",
      "Google",
      "AtlasCloud",
      "Phala",
      "BaseTen",
      "Parasail",
      "SambaNova",
      "Amazon Bedrock",
      "Together",
      "WandB",
      "Nebius",
      "Groq",
      "Crusoe",
      "Fireworks",
      "Cerebras",
    ],
  },
];

export function getModelEntry(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((model) => model.id === id);
}
