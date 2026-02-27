"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDeleteButtonProps {
  onConfirm: () => void;
  /** Classes applied when in idle (non-confirming) state */
  idleClassName?: string;
  /** Classes applied when in confirming state */
  confirmClassName?: string;
  /** Base classes always applied */
  className?: string;
}

export function ConfirmDeleteButton({
  onConfirm,
  idleClassName = "w-6",
  confirmClassName = "w-auto gap-1 px-1.5 bg-destructive/15",
  className,
}: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirming]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      className={cn(
        "h-6 p-0 text-destructive hover:text-destructive",
        confirming ? confirmClassName : idleClassName,
        className
      )}
      title={confirming ? "Click again to delete" : "Delete"}
      onClick={(e) => {
        e.stopPropagation();
        if (confirming) {
          onConfirm();
          setConfirming(false);
        } else {
          setConfirming(true);
        }
      }}
    >
      <Trash2 className="h-3 w-3" />
      {confirming && <span className="text-[10px] font-medium">?</span>}
    </Button>
  );
}
