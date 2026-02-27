"use client";

import { Button } from "@/components/ui/button";
import { Check, CheckCheck, X, XCircle, Pencil } from "lucide-react";

interface ReviewActionsProps {
  editing: boolean;
  allResolved: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onApply: () => void;
  onReject: () => void;
  bulk: { acceptAll: () => void; rejectAll: () => void };
}

export function ReviewActions({
  editing, allResolved, onEdit, onCancelEdit, onApply, onReject, bulk,
}: ReviewActionsProps) {
  return (
    <div className="relative z-10 flex flex-col gap-2 border-t border-border/40 pt-2">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={onReject}>
          <XCircle className="mr-1 h-3 w-3" />
          Dismiss
        </Button>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={editing ? onCancelEdit : onEdit}>
            {editing ? "Cancel" : <><Pencil className="mr-1 h-3 w-3" />Edit</>}
          </Button>
          {!editing && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={bulk.acceptAll}>
                <CheckCheck className="mr-1 h-3 w-3" />
                All
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={bulk.rejectAll}>
                <X className="mr-1 h-3 w-3" />
                None
              </Button>
            </>
          )}
        </div>
      </div>
      {(allResolved || editing) && (
        <Button size="sm" className="h-8 w-full text-xs" onClick={onApply}>
          <Check className="mr-1 h-3 w-3" />
          Apply Changes
        </Button>
      )}
    </div>
  );
}
