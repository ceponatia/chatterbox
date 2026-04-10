"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createDefaultAppearanceEntries,
  createEmptyBehavioralProfile,
  createEmptyCharacterIdentity,
} from "@/lib/character-schema";
import { parseCharacterMarkdown } from "@/lib/character-markdown-parser";
import type { ParsedCharacterMarkdown } from "@/lib/character-markdown-parser";
import {
  loadStoryCharacter,
  parseCharacterIntoStructured,
  updateStoryCharacter,
} from "@/lib/story-project-client";
import type {
  CharacterAppearanceEntry,
  CharacterBehavioralProfile,
  CharacterIdentity,
  DialogueExample,
  MutabilityTier,
  StoryCharacterRecord,
} from "@/lib/story-project-types";

export interface CharacterBuilderDraft {
  name: string;
  role: string;
  isPlayer: boolean;
  importedMarkdown: string;
  identity: CharacterIdentity;
  background: string;
  appearance: CharacterAppearanceEntry[];
  behavioralProfile: CharacterBehavioralProfile;
  startingDemeanor: string;
  dialogueExamples: DialogueExample[];
}

function createDraft(record: StoryCharacterRecord): CharacterBuilderDraft {
  return {
    name: record.name,
    role: record.role || "supporting",
    isPlayer: record.isPlayer,
    importedMarkdown: record.importedMarkdown ?? "",
    identity: record.identity ?? createEmptyCharacterIdentity(),
    background: record.background ?? "",
    appearance: record.appearance ?? createDefaultAppearanceEntries(),
    behavioralProfile:
      record.behavioralProfile ?? createEmptyBehavioralProfile(),
    startingDemeanor: record.startingDemeanor ?? "",
    dialogueExamples: record.dialogueExamples ?? [],
  };
}

function serializeDraft(draft: CharacterBuilderDraft): string {
  return JSON.stringify(draft);
}

function draftKey(characterId: string): string {
  return `character-draft-${characterId}`;
}

function useLoadedCharacter(storyId: string, characterId: string) {
  const [character, setCharacter] = useState<StoryCharacterRecord | null>(null);
  const [draft, setDraft] = useState<CharacterBuilderDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCharacter() {
      setLoading(true);
      setError(null);
      setStatus(null);
      try {
        const record = await loadStoryCharacter(storyId, characterId);
        if (!active) return;
        const serverDraft = createDraft(record);
        const serverSnapshot = serializeDraft(serverDraft);

        const savedRaw = localStorage.getItem(draftKey(characterId));
        if (savedRaw && savedRaw !== serverSnapshot) {
          try {
            const restored = JSON.parse(savedRaw) as CharacterBuilderDraft;
            setCharacter(record);
            setDraft(restored);
            setInitialSnapshot(serverSnapshot);
            setStatus("Restored unsaved draft.");
          } catch {
            setCharacter(record);
            setDraft(serverDraft);
            setInitialSnapshot(serverSnapshot);
          }
        } else {
          setCharacter(record);
          setDraft(serverDraft);
          setInitialSnapshot(serverSnapshot);
        }
      } catch (nextError) {
        if (!active) return;
        setError(
          nextError instanceof Error ? nextError.message : "Load failed",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCharacter();
    return () => {
      active = false;
    };
  }, [storyId, characterId]);

  return {
    character,
    setCharacter,
    draft,
    setDraft,
    loading,
    saving,
    setSaving,
    error,
    setError,
    status,
    setStatus,
    initialSnapshot,
    setInitialSnapshot,
  };
}

function useBeforeUnloadGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}

function useDraftActions(
  setDraft: Dispatch<SetStateAction<CharacterBuilderDraft | null>>,
  setStatus: Dispatch<SetStateAction<string | null>>,
) {
  function updateDraft(
    updater: (current: CharacterBuilderDraft) => CharacterBuilderDraft,
  ) {
    setDraft((current) => {
      if (!current) return current;
      return updater(current);
    });
    setStatus(null);
  }

  return {
    setName(name: string) {
      updateDraft((current) => ({ ...current, name }));
    },
    setRole(role: string) {
      updateDraft((current) => ({ ...current, role }));
    },
    setIsPlayer(isPlayer: boolean) {
      updateDraft((current) => ({ ...current, isPlayer }));
    },
    setBackground(background: string) {
      updateDraft((current) => ({ ...current, background }));
    },
    setStartingDemeanor(startingDemeanor: string) {
      updateDraft((current) => ({ ...current, startingDemeanor }));
    },
    updateIdentityField(key: keyof CharacterIdentity, value: string) {
      updateDraft((current) => ({
        ...current,
        identity: { ...current.identity, [key]: value },
      }));
    },
    updateBehaviorField(key: keyof CharacterBehavioralProfile, value: string) {
      updateDraft((current) => ({
        ...current,
        behavioralProfile: { ...current.behavioralProfile, [key]: value },
      }));
    },
    updateAppearanceEntry(
      index: number,
      key: keyof CharacterAppearanceEntry,
      value: string,
    ) {
      updateDraft((current) => ({
        ...current,
        appearance: current.appearance.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, [key]: value } : entry,
        ),
      }));
    },
    addAppearanceEntry() {
      updateDraft((current) => ({
        ...current,
        appearance: [...current.appearance, { attribute: "", value: "" }],
      }));
    },
    removeAppearanceEntry(index: number) {
      updateDraft((current) => ({
        ...current,
        appearance: current.appearance.filter(
          (_, entryIndex) => entryIndex !== index,
        ),
      }));
    },
    setMutabilityTier(index: number, tier: MutabilityTier | undefined) {
      updateDraft((current) => ({
        ...current,
        appearance: current.appearance.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, mutabilityTier: tier } : entry,
        ),
      }));
    },
    addDialogueExample() {
      updateDraft((current) => ({
        ...current,
        dialogueExamples: [
          ...current.dialogueExamples,
          { text: "", tag: "general" },
        ],
      }));
    },
    removeDialogueExample(index: number) {
      updateDraft((current) => ({
        ...current,
        dialogueExamples: current.dialogueExamples.filter(
          (_, entryIndex) => entryIndex !== index,
        ),
      }));
    },
    updateDialogueExample(
      index: number,
      field: keyof DialogueExample,
      value: string,
    ) {
      updateDraft((current) => ({
        ...current,
        dialogueExamples: current.dialogueExamples.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, [field]: value } : entry,
        ),
      }));
    },
  };
}

export function useCharacterBuilder({
  storyId,
  characterId,
}: {
  storyId: string;
  characterId: string;
}) {
  const loaded = useLoadedCharacter(storyId, characterId);
  const actions = useDraftActions(loaded.setDraft, loaded.setStatus);
  const isDirty = loaded.draft
    ? loaded.initialSnapshot !== null &&
      serializeDraft(loaded.draft) !== loaded.initialSnapshot
    : false;

  useBeforeUnloadGuard(isDirty);

  const draftRef = useRef(loaded.draft);
  draftRef.current = loaded.draft;

  const persistDraft = useCallback(() => {
    if (draftRef.current) {
      localStorage.setItem(
        draftKey(characterId),
        serializeDraft(draftRef.current),
      );
    }
  }, [characterId]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const timer = setTimeout(persistDraft, 500);
    return () => clearTimeout(timer);
  }, [isDirty, loaded.draft, persistDraft]);

  async function save() {
    if (!loaded.draft || loaded.saving) return;

    loaded.setSaving(true);
    loaded.setError(null);
    loaded.setStatus(null);
    try {
      const saved = await updateStoryCharacter(storyId, characterId, {
        name: loaded.draft.name,
        role: loaded.draft.role,
        isPlayer: loaded.draft.isPlayer,
        importedMarkdown: loaded.draft.importedMarkdown || null,
        identity: loaded.draft.identity,
        background: loaded.draft.background || null,
        appearance: loaded.draft.appearance,
        behavioralProfile: loaded.draft.behavioralProfile,
        startingDemeanor: loaded.draft.startingDemeanor || null,
        dialogueExamples: loaded.draft.dialogueExamples.filter(
          (ex) => ex.text.trim().length > 0,
        ),
      });
      const nextDraft = createDraft(saved);
      loaded.setCharacter(saved);
      loaded.setDraft(nextDraft);
      loaded.setInitialSnapshot(serializeDraft(nextDraft));
      localStorage.removeItem(draftKey(characterId));
      loaded.setStatus("Character saved.");
    } catch (nextError) {
      loaded.setError(
        nextError instanceof Error ? nextError.message : "Save failed",
      );
    } finally {
      loaded.setSaving(false);
    }
  }

  async function parseFromImport() {
    if (loaded.saving) return;

    loaded.setSaving(true);
    loaded.setError(null);
    loaded.setStatus(null);
    try {
      const parsed = await parseCharacterIntoStructured(storyId, characterId);
      const nextDraft = createDraft(parsed);
      loaded.setCharacter(parsed);
      loaded.setDraft(nextDraft);
      loaded.setInitialSnapshot(serializeDraft(nextDraft));
      localStorage.removeItem(draftKey(characterId));
      loaded.setStatus("Imported markdown parsed into structured fields.");
    } catch (nextError) {
      loaded.setError(
        nextError instanceof Error ? nextError.message : "Parse failed",
      );
    } finally {
      loaded.setSaving(false);
    }
  }

  function previewParse(): ParsedCharacterMarkdown | null {
    if (!loaded.draft?.importedMarkdown) return null;
    return parseCharacterMarkdown(loaded.draft.importedMarkdown);
  }

  function applySelectiveParse(
    parsed: ParsedCharacterMarkdown,
    selectedSections: Set<string>,
  ) {
    loaded.setDraft((current) => {
      if (!current) return current;
      let next = { ...current };

      if (selectedSections.has("identity") && parsed.identity) {
        next = { ...next, identity: parsed.identity };
      }
      if (selectedSections.has("background") && parsed.background !== null) {
        next = { ...next, background: parsed.background };
      }
      if (selectedSections.has("appearance") && parsed.appearance) {
        next = { ...next, appearance: parsed.appearance };
      }
      if (
        selectedSections.has("behavioralProfile") &&
        parsed.behavioralProfile
      ) {
        next = { ...next, behavioralProfile: parsed.behavioralProfile };
      }
      if (
        selectedSections.has("startingDemeanor") &&
        parsed.startingDemeanor !== null
      ) {
        next = { ...next, startingDemeanor: parsed.startingDemeanor };
      }
      if (parsed.name && selectedSections.has("identity")) {
        next = { ...next, name: parsed.name };
      }

      return next;
    });
    loaded.setStatus("Applied selected sections from import.");
  }

  return {
    character: loaded.character,
    draft: loaded.draft,
    loading: loaded.loading,
    saving: loaded.saving,
    error: loaded.error,
    status: loaded.status,
    isDirty,
    ...actions,
    save,
    parseFromImport,
    previewParse,
    applySelectiveParse,
  };
}
