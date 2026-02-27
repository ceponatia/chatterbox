"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationMeta } from "@/lib/storage";

interface ConversationListProps {
  conversations: ConversationMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
}: {
  conv: ConversationMeta;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-start gap-2 overflow-hidden rounded-md px-2.5 py-2 text-sm cursor-pointer transition-colors",
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted"
      )}
      onClick={onSelect}
    >
      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex w-0 min-w-0 flex-1 flex-col pr-5">
        <span className="truncate text-xs font-medium">{conv.title}</span>
        <span className="text-[10px] text-muted-foreground">
          {formatDate(conv.updatedAt)}
        </span>
      </div>
      <ConfirmDeleteButton
        onConfirm={onDelete}
        className="absolute right-1 top-1 h-5 transition-opacity"
        idleClassName="w-5 opacity-0 group-hover:opacity-100"
        confirmClassName="w-auto gap-0.5 px-1.5 bg-destructive/15 opacity-100"
      />
    </div>
  );
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-3">
        <span className="text-sm font-semibold">Conversations</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onNew} title="New chat">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          )}
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              onSelect={() => onSelect(conv.id)}
              onDelete={() => onDelete(conv.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
