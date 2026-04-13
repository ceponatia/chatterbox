import type { APIRequestContext } from "@playwright/test";

export function e2eName(label: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `e2e-${label}-${ts}-${rand}`;
}

export async function createStoryProject(
  request: APIRequestContext,
  name?: string,
): Promise<{ id: string; name: string }> {
  const projectName = name ?? e2eName("story");
  const res = await request.post("/api/story-projects", {
    data: { name: projectName },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create story project: ${res.status()}`);
  }
  const body = (await res.json()) as { id: string; name?: string };
  return { id: body.id, name: body.name ?? projectName };
}

export async function deleteStoryProject(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`/api/story-projects/${id}`);
}

export async function createConversation(
  request: APIRequestContext,
  title?: string,
): Promise<{ id: string; title: string }> {
  const id = crypto.randomUUID();
  const convTitle = title ?? e2eName("conv");
  const now = new Date().toISOString();
  const res = await request.put(`/api/conversations/${id}`, {
    data: {
      id,
      title: convTitle,
      createdAt: now,
      updatedAt: now,
      storyProjectId: null,
      storyProjectName: null,
      messages: [],
      systemPrompt: "",
      storyState: "",
      previousStoryState: null,
      storyStateLastUpdated: null,
      settings: {},
      systemPromptBaseline: null,
      storyStateBaseline: null,
      lastIncludedAt: {},
      customSegments: null,
      structuredState: null,
      lastPipelineTurn: 0,
    },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create conversation: ${res.status()}`);
  }
  return { id, title: convTitle };
}

export async function deleteConversation(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`/api/conversations/${id}`);
}
