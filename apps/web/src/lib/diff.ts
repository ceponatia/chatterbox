export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1]![j - 1]! + 1
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp;
}

function backtrackDiff(dp: number[][], oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "unchanged", text: oldLines[i - 1]! });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.push({ type: "added", text: newLines[j - 1]! });
      j--;
    } else {
      result.push({ type: "removed", text: oldLines[i - 1]! });
      i--;
    }
  }
  result.reverse();
  return result;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  return backtrackDiff(buildLcsTable(oldLines, newLines), oldLines, newLines);
}

// ---------------------------------------------------------------------------
// Hunk segmentation for per-hunk accept/reject
// ---------------------------------------------------------------------------

export type DiffSegment =
  | { kind: "context"; lines: DiffLine[] }
  | { kind: "hunk"; id: number; lines: DiffLine[] };

export function segmentDiff(lines: DiffLine[]): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let contextBuf: DiffLine[] = [];
  let hunkBuf: DiffLine[] = [];
  let hunkId = 0;

  const flushContext = () => {
    if (contextBuf.length > 0) {
      segments.push({ kind: "context", lines: contextBuf });
      contextBuf = [];
    }
  };
  const flushHunk = () => {
    if (hunkBuf.length > 0) {
      segments.push({ kind: "hunk", id: hunkId++, lines: hunkBuf });
      hunkBuf = [];
    }
  };

  for (const line of lines) {
    if (line.type === "unchanged") {
      flushHunk();
      contextBuf.push(line);
    } else {
      flushContext();
      hunkBuf.push(line);
    }
  }
  flushContext();
  flushHunk();

  return segments;
}

export type HunkDecision = "accepted" | "rejected";

function keepLine(decision: HunkDecision | undefined, lineType: DiffLine["type"]): boolean {
  return (decision === "accepted" && lineType === "added") ||
         (decision === "rejected" && lineType === "removed");
}

export function mergeWithDecisions(
  segments: DiffSegment[],
  decisions: Record<number, HunkDecision>
): string {
  const out: string[] = [];
  for (const seg of segments) {
    if (seg.kind === "context") {
      for (const l of seg.lines) out.push(l.text);
    } else {
      for (const l of seg.lines) {
        if (keepLine(decisions[seg.id], l.type)) out.push(l.text);
      }
    }
  }
  return out.join("\n");
}
