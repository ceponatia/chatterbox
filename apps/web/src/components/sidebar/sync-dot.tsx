import type { SyncStatus } from "@/lib/hooks/use-sync-status";

const SYNC_DOT_COLORS: Record<SyncStatus, string> = {
  saved: "bg-green-500",
  pending: "bg-yellow-500",
  error: "bg-red-500",
};

const SYNC_DOT_TITLES: Record<SyncStatus, string> = {
  saved: "Saved and up to date",
  pending: "Saving…",
  error: "Sync error — LLM may see stale data",
};

export function SyncDot({
  status,
  pulse,
}: {
  status: SyncStatus;
  pulse?: boolean;
}) {
  return (
    <>
      <span
        className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${SYNC_DOT_COLORS[status]} ${pulse ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      <span className="sr-only">{SYNC_DOT_TITLES[status]}</span>
    </>
  );
}
