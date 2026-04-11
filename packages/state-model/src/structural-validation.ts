import type {
  AppearanceEntry,
  DemeanorEntry,
  HardFact,
  Relationship,
  StructuredStoryState,
} from "./types.js";

export type IntegrityIssueKind =
  | "orphaned_entity_ref"
  | "dangling_superseded_by"
  | "missing_thread_entity"
  | "self_referencing_relationship"
  | "duplicate_entity_id";

export type IssueSeverity = "error" | "warning";

export interface IntegrityIssue {
  readonly kind: IntegrityIssueKind;
  readonly severity: IssueSeverity;
  readonly section: string;
  readonly message: string;
  readonly autoFixable: boolean;
}

export interface IntegrityReport {
  readonly issues: readonly IntegrityIssue[];
  readonly autoFixCount: number;
}

export interface IntegrityRepairResult {
  readonly state: StructuredStoryState;
  readonly applied: readonly IntegrityIssue[];
  readonly skipped: readonly IntegrityIssue[];
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function buildOrphanedRelationshipIssue(
  relationship: Relationship,
  index: number,
  entityIds: ReadonlySet<string>,
): IntegrityIssue | null {
  const missingRefs: string[] = [];

  if (!entityIds.has(relationship.fromEntityId)) {
    missingRefs.push(`fromEntityId "${relationship.fromEntityId}"`);
  }
  if (!entityIds.has(relationship.toEntityId)) {
    missingRefs.push(`toEntityId "${relationship.toEntityId}"`);
  }

  if (missingRefs.length === 0) {
    return null;
  }

  return {
    kind: "orphaned_entity_ref",
    severity: "error",
    section: "relationships",
    message: `Relationship at index ${index} references missing entity IDs: ${missingRefs.join(
      ", ",
    )}.`,
    autoFixable: true,
  };
}

function buildOrphanedAppearanceIssue(
  entry: AppearanceEntry,
  index: number,
  entityIds: ReadonlySet<string>,
): IntegrityIssue | null {
  if (entityIds.has(entry.entityId)) {
    return null;
  }

  return {
    kind: "orphaned_entity_ref",
    severity: "error",
    section: "appearance",
    message: `Appearance entry at index ${index} references missing entity ID "${entry.entityId}".`,
    autoFixable: true,
  };
}

function buildOrphanedDemeanorIssue(
  entry: DemeanorEntry,
  index: number,
  entityIds: ReadonlySet<string>,
): IntegrityIssue | null {
  if (entityIds.has(entry.entityId)) {
    return null;
  }

  return {
    kind: "orphaned_entity_ref",
    severity: "error",
    section: "demeanor",
    message: `Demeanor entry at index ${index} references missing entity ID "${entry.entityId}".`,
    autoFixable: true,
  };
}

function buildSelfReferencingRelationshipIssue(
  relationship: Relationship,
  index: number,
): IntegrityIssue | null {
  if (relationship.fromEntityId !== relationship.toEntityId) {
    return null;
  }

  return {
    kind: "self_referencing_relationship",
    severity: "warning",
    section: "relationships",
    message: `Relationship at index ${index} references the same entity ID "${relationship.fromEntityId}" for both sides.`,
    autoFixable: true,
  };
}

function collectRelationshipIssues(
  state: StructuredStoryState,
  entityIds: ReadonlySet<string>,
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  for (let index = 0; index < state.relationships.length; index += 1) {
    const relationship = state.relationships[index];
    if (!relationship) {
      continue;
    }

    const orphanedIssue = buildOrphanedRelationshipIssue(
      relationship,
      index,
      entityIds,
    );
    if (orphanedIssue) {
      issues.push(orphanedIssue);
    }

    const selfReferencingIssue = buildSelfReferencingRelationshipIssue(
      relationship,
      index,
    );
    if (selfReferencingIssue) {
      issues.push(selfReferencingIssue);
    }
  }

  return issues;
}

function collectAppearanceIssues(
  state: StructuredStoryState,
  entityIds: ReadonlySet<string>,
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  for (let index = 0; index < state.appearance.length; index += 1) {
    const entry = state.appearance[index];
    if (!entry) {
      continue;
    }

    const issue = buildOrphanedAppearanceIssue(entry, index, entityIds);
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

function collectDemeanorIssues(
  state: StructuredStoryState,
  entityIds: ReadonlySet<string>,
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  for (let index = 0; index < state.demeanor.length; index += 1) {
    const entry = state.demeanor[index];
    if (!entry) {
      continue;
    }

    const issue = buildOrphanedDemeanorIssue(entry, index, entityIds);
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

function buildDuplicateEntityIssues(
  state: StructuredStoryState,
): IntegrityIssue[] {
  const seenIds = new Set<string>();
  const reportedIds = new Set<string>();
  const issues: IntegrityIssue[] = [];

  for (let index = 0; index < state.entities.length; index += 1) {
    const entity = state.entities[index];
    if (!entity) {
      continue;
    }

    if (!seenIds.has(entity.id)) {
      seenIds.add(entity.id);
      continue;
    }

    if (reportedIds.has(entity.id)) {
      continue;
    }

    reportedIds.add(entity.id);
    issues.push({
      kind: "duplicate_entity_id",
      severity: "error",
      section: "cast",
      message: `Duplicate entity ID "${entity.id}" detected at index ${index}.`,
      autoFixable: false,
    });
  }

  return issues;
}

function buildDanglingSupersededByIssue(
  fact: HardFact,
  index: number,
  normalizedFacts: readonly string[],
): IntegrityIssue | null {
  const snippet = normalizeSearchText(fact.supersededBy ?? "");
  if (snippet.length === 0) {
    return null;
  }

  const hasMatch = normalizedFacts.some(
    (candidate, candidateIndex) =>
      candidateIndex !== index && candidate.includes(snippet),
  );

  if (hasMatch) {
    return null;
  }

  return {
    kind: "dangling_superseded_by",
    severity: "warning",
    section: "hardFacts",
    message: `Hard fact at index ${index} has a supersededBy snippet "${snippet}" that does not match any other fact.`,
    autoFixable: false,
  };
}

function collectHardFactIssues(state: StructuredStoryState): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const normalizedFacts = state.hardFacts.map((fact) =>
    normalizeSearchText(fact.fact),
  );

  for (let index = 0; index < state.hardFacts.length; index += 1) {
    const fact = state.hardFacts[index];
    if (!fact) {
      continue;
    }

    const issue = buildDanglingSupersededByIssue(fact, index, normalizedFacts);
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

export function validateStructuralIntegrity(
  state: StructuredStoryState,
): IntegrityReport {
  const entityIds = new Set(state.entities.map((entity) => entity.id));
  const issues = [
    ...collectRelationshipIssues(state, entityIds),
    ...collectAppearanceIssues(state, entityIds),
    ...collectDemeanorIssues(state, entityIds),
    ...buildDuplicateEntityIssues(state),
    ...collectHardFactIssues(state),
  ];

  return {
    issues,
    autoFixCount: issues.filter((issue) => issue.autoFixable).length,
  };
}

export function applyStructuralRepairs(
  state: StructuredStoryState,
  report: IntegrityReport,
): IntegrityRepairResult {
  const entityIds = new Set(state.entities.map((entity) => entity.id));
  const applied = report.issues.filter((issue) => issue.autoFixable);
  const skipped = report.issues.filter((issue) => !issue.autoFixable);

  return {
    state: {
      ...state,
      relationships: state.relationships.filter(
        (relationship) =>
          entityIds.has(relationship.fromEntityId) &&
          entityIds.has(relationship.toEntityId) &&
          relationship.fromEntityId !== relationship.toEntityId,
      ),
      appearance: state.appearance.filter((entry) =>
        entityIds.has(entry.entityId),
      ),
      demeanor: state.demeanor.filter((entry) => entityIds.has(entry.entityId)),
    },
    applied,
    skipped,
  };
}
