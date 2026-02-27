"use client";

import { CheckCircle2, AlertTriangle, RefreshCw, Pencil } from "lucide-react";

export const DISPOSITION_CONFIG = {
  auto_accepted: {
    label: "Auto-accepted",
    icon: CheckCircle2,
    className: "text-green-600 border-green-500/50",
  },
  flagged: {
    label: "Flagged",
    icon: AlertTriangle,
    className: "text-amber-600 border-amber-500/50",
  },
  retried: {
    label: "Retried",
    icon: RefreshCw,
    className: "text-orange-600 border-orange-500/50",
  },
  manual_edit: {
    label: "Manual",
    icon: Pencil,
    className: "text-blue-600 border-blue-500/50",
  },
} as const;

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function ValidationBadge({
  label,
  pass,
}: {
  label: string;
  pass: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-1 py-0 text-[9px] border ${
        pass
          ? "border-green-500/30 text-green-600"
          : "border-red-500/30 text-red-600"
      }`}
    >
      {pass ? "✓" : "✗"} {label}
    </span>
  );
}
