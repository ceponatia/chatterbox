"use client";

import type {
  StoryCharacterRecord,
  StoryProjectCharacterInput,
  StoryProjectDetail,
  StoryProjectDuplicateInput,
  StoryProjectExportPayload,
  StoryProjectImportInput,
  StoryProjectInput,
  StoryProjectLaunchResult,
  StoryProjectRelationshipInput,
  StoryProjectSummary,
  StoryRelationshipRecord,
} from "@/lib/story-project-types";

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    return new Promise<T>(() => {});
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ?? `Request failed: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

export function listStoryProjects() {
  return requestJson<StoryProjectSummary[]>("/api/story-projects");
}

export function createStoryProject(
  input: StoryProjectInput | StoryProjectDuplicateInput,
) {
  return requestJson<StoryProjectDetail>("/api/story-projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loadStoryProject(id: string) {
  return requestJson<StoryProjectDetail>(`/api/story-projects/${id}`);
}

export function updateStoryProject(id: string, input: StoryProjectInput) {
  return requestJson<StoryProjectDetail>(`/api/story-projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteStoryProject(id: string) {
  return requestJson<{ ok: true }>(`/api/story-projects/${id}`, {
    method: "DELETE",
  });
}

export function createStoryCharacter(
  id: string,
  input: StoryProjectCharacterInput,
) {
  const payload: StoryProjectCharacterInput = {
    ...input,
    entityId: input.entityId ?? crypto.randomUUID(),
  };
  return requestJson<StoryCharacterRecord>(
    `/api/story-projects/${id}/characters`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function updateStoryCharacter(
  projectId: string,
  characterId: string,
  input: StoryProjectCharacterInput,
) {
  return requestJson<StoryCharacterRecord>(
    `/api/story-projects/${projectId}/characters/${characterId}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export function deleteStoryCharacter(projectId: string, characterId: string) {
  return requestJson<{ ok: true }>(
    `/api/story-projects/${projectId}/characters/${characterId}`,
    { method: "DELETE" },
  );
}

export function loadStoryCharacter(projectId: string, characterId: string) {
  return requestJson<StoryCharacterRecord>(
    `/api/story-projects/${projectId}/characters/${characterId}`,
  );
}

export function getStoryRelationships(projectId: string) {
  return requestJson<StoryRelationshipRecord[]>(
    `/api/story-projects/${projectId}/relationships`,
  );
}

export function updateStoryRelationships(
  projectId: string,
  relationships: StoryProjectRelationshipInput[],
) {
  return requestJson<StoryRelationshipRecord[]>(
    `/api/story-projects/${projectId}/relationships`,
    {
      method: "PUT",
      body: JSON.stringify({ relationships }),
    },
  );
}

export function importStoryProject(id: string, input: StoryProjectImportInput) {
  return requestJson<StoryProjectDetail>(`/api/story-projects/${id}/import`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function regenerateStoryProject(id: string) {
  return requestJson<StoryProjectDetail>(`/api/story-projects/${id}/generate`, {
    method: "POST",
  });
}

export function exportStoryProject(id: string) {
  return requestJson<StoryProjectExportPayload>(
    `/api/story-projects/${id}/export`,
  );
}

export function launchStoryProject(id: string) {
  return requestJson<StoryProjectLaunchResult>(
    `/api/story-projects/${id}/launch`,
    {
      method: "POST",
    },
  );
}

export function parseCharacterIntoStructured(
  projectId: string,
  characterId: string,
) {
  return requestJson<StoryCharacterRecord>(
    `/api/story-projects/${projectId}/characters/${characterId}/parse`,
    { method: "POST" },
  );
}
