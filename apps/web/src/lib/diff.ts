export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1]![j - 1]! + 1
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp;
}

function backtrackDiff(
  dp: number[][],
  oldLines: string[],
  newLines: string[],
): DiffLine[] {
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "unchanged", text: oldLines[i - 1]! });
      i--;
      j--;
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
