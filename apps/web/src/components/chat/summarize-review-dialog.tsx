"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Pencil, Loader2 } from "lucide-react";

interface SummarizeReviewDialogProps {
  open: boolean;
  proposedStoryState: string;
  isGenerating: boolean;
  onAccept: (storyState: string) => void;
  onReject: () => void;
}

export function SummarizeReviewDialog({
  open,
  proposedStoryState,
  isGenerating,
  onAccept,
  onReject,
}: SummarizeReviewDialogProps) {
  const [editing, setEditing] = useState(false);
  const [editedState, setEditedState] = useState(proposedStoryState);

  // Sync when new proposed state arrives
  if (!editing && editedState !== proposedStoryState) {
    setEditedState(proposedStoryState);
  }

  const handleAccept = () => {
    onAccept(editing ? editedState : proposedStoryState);
    setEditing(false);
  };

  const handleReject = () => {
    setEditing(false);
    onReject();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleReject(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isGenerating ? "Generating Story State Update…" : "Review Story State Update"}
          </DialogTitle>
          <DialogDescription>
            {isGenerating
              ? "The model is analyzing the conversation and generating an updated Story State."
              : "Review the proposed Story State update. You can accept it as-is, edit it, or reject it entirely."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isGenerating ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : editing ? (
            <Textarea
              value={editedState}
              onChange={(e) => setEditedState(e.target.value)}
              className="min-h-75 font-mono text-sm"
            />
          ) : (
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm font-mono">
              {proposedStoryState}
            </pre>
          )}
        </div>

        {!isGenerating && (
          <DialogFooter className="flex-row gap-2 sm:justify-between">
            <Button variant="destructive" size="sm" onClick={handleReject}>
              <X className="mr-1 h-4 w-4" />
              Reject
            </Button>
            <div className="flex gap-2">
              {!editing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditedState(proposedStoryState);
                    setEditing(true);
                  }}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel Edit
                </Button>
              )}
              <Button size="sm" onClick={handleAccept}>
                <Check className="mr-1 h-4 w-4" />
                Accept
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
