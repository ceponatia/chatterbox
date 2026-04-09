"use client";

import { useState, useRef, useEffect } from "react";
import { Scissors, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmActionButtonProps {
  onConfirm: () => void;
  icon: LucideIcon;
  idleTitle: string;
  confirmTitle: string;
  /** Classes applied when in idle (non-confirming) state */
  idleClassName?: string;
  /** Classes applied when in confirming state */
  confirmClassName?: string;
  /** Base classes always applied */
  className?: string;
}
function ConfirmActionButton({
  onConfirm,
  icon: Icon,
  idleTitle,
  confirmTitle,
  idleClassName = "w-6",
  confirmClassName = "w-auto gap-1 px-1.5 bg-destructive/15",
  className,
}: ConfirmActionButtonProps) {
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
        className,
      )}
      title={confirming ? confirmTitle : idleTitle}
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
      <Icon className="h-3 w-3" />
      {confirming && <span className="text-[10px] font-medium">?</span>}
    </Button>
  );
}

interface ConfirmDeleteButtonProps {
  onConfirm: () => void;
  idleClassName?: string;
  confirmClassName?: string;
  className?: string;
}

export function ConfirmDeleteButton({
  onConfirm,
  idleClassName,
  confirmClassName,
  className,
}: ConfirmDeleteButtonProps) {
  return (
    <ConfirmActionButton
      onConfirm={onConfirm}
      icon={Trash2}
      idleTitle="Delete"
      confirmTitle="Click again to delete"
      idleClassName={idleClassName}
      confirmClassName={confirmClassName}
      className={className}
    />
  );
}

interface ConfirmTruncateButtonProps {
  onConfirm: () => void;
  idleClassName?: string;
  confirmClassName?: string;
  className?: string;
}

export function ConfirmTruncateButton({
  onConfirm,
  idleClassName,
  confirmClassName = "w-auto gap-1 px-1.5 app-warning-action-confirm",
  className,
}: ConfirmTruncateButtonProps) {
  return (
    <ConfirmActionButton
      onConfirm={onConfirm}
      icon={Scissors}
      idleTitle="Delete all after"
      confirmTitle="Click again to delete all after"
      idleClassName={idleClassName}
      confirmClassName={confirmClassName}
      className={cn("app-warning-action", className)}
    />
  );
}
