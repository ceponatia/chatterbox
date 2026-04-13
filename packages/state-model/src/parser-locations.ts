export interface RawConnectionEntry {
  targetName: string;
  description?: string;
  traversalHint?: string;
}

export interface RawLocationEntry {
  name: string;
  description: string;
  tags: string[];
  atmosphere: string;
  connections: RawConnectionEntry[];
}

function classifyLocationKey(
  key: string,
): "description" | "tags" | "atmosphere" | "connections" | null {
  const lower = key.toLowerCase();
  if (lower.includes("description")) return "description";
  if (lower.includes("tag")) return "tags";
  if (lower.includes("atmosphere") || lower.includes("mood"))
    return "atmosphere";
  if (lower.includes("connect")) return "connections";
  return null;
}

function parseConnectionList(value: string): RawConnectionEntry[] {
  const entries: RawConnectionEntry[] = [];
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    const parenMatch = part.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (parenMatch) {
      const targetName = parenMatch[1]!.trim();
      const inner = parenMatch[2]!;
      const segments = inner
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      entries.push({
        targetName,
        description: segments[0],
        traversalHint: segments.length > 1 ? segments[1] : undefined,
      });
    } else {
      entries.push({ targetName: part });
    }
  }

  return entries;
}

export function parseLocationsRaw(content: string): RawLocationEntry[] {
  const locations: RawLocationEntry[] = [];
  const blocks = content.split(/^### /m);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;
    const newlineIdx = block.indexOf("\n");
    const name =
      newlineIdx === -1 ? block.trim() : block.slice(0, newlineIdx).trim();
    const body = newlineIdx === -1 ? "" : block.slice(newlineIdx + 1).trim();

    const loc: RawLocationEntry = {
      name,
      description: "",
      tags: [],
      atmosphere: "",
      connections: [],
    };

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      const kvMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*:\s*(.*)$/);
      if (!kvMatch) continue;

      const kind = classifyLocationKey(kvMatch[1]!);
      const val = kvMatch[2]!.trim();
      if (kind === "description") loc.description = val;
      else if (kind === "tags")
        loc.tags = val
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      else if (kind === "atmosphere") loc.atmosphere = val;
      else if (kind === "connections")
        loc.connections = parseConnectionList(val);
    }

    locations.push(loc);
  }

  return locations;
}
