const OPTIONAL_SENSORY_FIELDS = ["scent", "texture", "taste"] as const;

export interface SensoryOverview {
  scent?: string;
  texture?: string;
  taste?: string;
  lockedFields?: string[];
}

export interface SensoryAttributeNote {
  attribute: string;
  scent?: string;
  texture?: string;
  taste?: string;
  lockedFields?: string[];
}

export interface SensoryProfile {
  overall: SensoryOverview;
  attributes: SensoryAttributeNote[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidLockedFields(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function hasValidOptionalSensoryFields(
  value: Record<string, unknown>,
): boolean {
  for (const field of OPTIONAL_SENSORY_FIELDS) {
    const fieldValue = value[field];

    if (fieldValue !== undefined && typeof fieldValue !== "string") {
      return false;
    }
  }

  return true;
}

function validateSensoryNode(value: unknown): boolean {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (!hasValidOptionalSensoryFields(value)) {
    return false;
  }

  if (
    value.lockedFields !== undefined &&
    !hasValidLockedFields(value.lockedFields)
  ) {
    return false;
  }

  return true;
}

export function emptySensoryProfile(): SensoryProfile {
  return {
    overall: {},
    attributes: [],
  };
}

export function validateSensoryProfile(
  value: unknown,
): value is SensoryProfile {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (!validateSensoryNode(value.overall)) {
    return false;
  }

  if (!Array.isArray(value.attributes)) {
    return false;
  }

  return value.attributes.every((attributeNote) => {
    if (!validateSensoryNode(attributeNote)) {
      return false;
    }

    return typeof attributeNote.attribute === "string";
  });
}
