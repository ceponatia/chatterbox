"use client";

import { UIMessage } from "ai";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChevronUp } from "lucide-react";
import { MessageBubble } from "./message-bubble";

const INITIAL_VISIBLE = 40;
const LOAD_MORE_COUNT = 20;

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onEditAndGenerate: (id: string, newText: string) => void;
}

export function MessageList({ messages, isLoading, onEdit, onDelete, onRetry, onEditAndGenerate }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const topAnchorRef = useRef<HTMLDivElement>(null);

  const { visibleMessages, hiddenCount, handleShowMore } = useVisibleMessages(messages, topAnchorRef);
  useAutoScroll(messages, bottomRef);
  const retryIds = useRetryIds(messages);

  if (messages.length === 0) return <EmptyState />;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-1 py-4">
        {hiddenCount > 0 && <ShowMoreButton hiddenCount={hiddenCount} onClick={handleShowMore} />}
        <div ref={topAnchorRef} />
        {visibleMessages.map((message) => (
          <MessageBubble key={message.id} message={message} canRetry={retryIds.has(message.id)}
            isLoading={isLoading} onEdit={onEdit} onDelete={onDelete} onRetry={onRetry} onEditAndGenerate={onEditAndGenerate} />
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && <NarratingIndicator />}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

function useVisibleMessages(messages: UIMessage[], topAnchorRef: React.RefObject<HTMLDivElement | null>) {
  const conversationKey = messages[0]?.id ?? "";
  const [visibleState, setVisibleState] = useState({ key: conversationKey, count: INITIAL_VISIBLE });
  if (visibleState.key !== conversationKey) setVisibleState({ key: conversationKey, count: INITIAL_VISIBLE });

  const hiddenCount = Math.max(0, messages.length - visibleState.count);
  const visibleMessages = hiddenCount > 0 ? messages.slice(hiddenCount) : messages;

  const handleShowMore = useCallback(() => {
    const anchor = topAnchorRef.current;
    const scrollParent = anchor?.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    const prevTop = anchor?.offsetTop ?? 0;
    setVisibleState((s) => ({ ...s, count: s.count + LOAD_MORE_COUNT }));
    requestAnimationFrame(() => {
      if (anchor && scrollParent) scrollParent.scrollTop += anchor.offsetTop - prevTop;
    });
  }, [topAnchorRef]);

  return { visibleMessages, hiddenCount, handleShowMore };
}

function useAutoScroll(messages: UIMessage[], bottomRef: React.RefObject<HTMLDivElement | null>) {
  const lastMsg = messages[messages.length - 1];
  const scrollTrigger = `${messages.length}:${lastMsg?.id}:${
    lastMsg?.parts?.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0) ?? 0
  }`;
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [scrollTrigger, bottomRef]);
}

function useRetryIds(messages: UIMessage[]) {
  return useMemo(() => {
    const ids = new Set<string>();
    if (messages.length === 0) return ids;
    const last = messages[messages.length - 1];
    if (!last) return ids;
    ids.add(last.id);
    if (last.role === "assistant" && messages.length >= 2) {
      const prev = messages[messages.length - 2];
      if (prev) ids.add(prev.id);
    }
    return ids;
  }, [messages]);
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center text-muted-foreground">
        <p className="text-lg font-medium">Start your story</p>
        <p className="mt-1 text-sm">Type your first action to begin the roleplay.</p>
      </div>
    </div>
  );
}

function ShowMoreButton({ hiddenCount, onClick }: { hiddenCount: number; onClick: () => void }) {
  const count = Math.min(LOAD_MORE_COUNT, hiddenCount);
  return (
    <div className="flex justify-center pb-2">
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={onClick}>
        <ChevronUp className="h-3 w-3" />
        Show {count} earlier message{count !== 1 ? "s" : ""}
        <span className="ml-1 text-[10px] opacity-60">({hiddenCount} hidden)</span>
      </Button>
    </div>
  );
}

function NarratingIndicator() {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300">
        <span className="animate-pulse text-xs">✦</span>
      </div>
      <div className="flex items-center rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
        <span className="animate-pulse text-sm text-muted-foreground">Narrating…</span>
      </div>
    </div>
  );
}
