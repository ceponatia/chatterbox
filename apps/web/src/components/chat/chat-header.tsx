import { useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import {
  Plus,
  Sparkles,
  Trash2,
  PanelLeftOpen,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConversationList } from "@/components/sidebar/conversation-list";
import { TurnCounter } from "@/components/chat/turn-counter";
import { getModelEntry } from "@/lib/model-registry";
import { useConversationManager } from "@/lib/hooks/use-conversation-manager";

function ConversationDrawer({
  conv,
}: {
  conv: ReturnType<typeof useConversationManager>;
}) {
  return (
    <Sheet open={conv.convDrawerOpen} onOpenChange={conv.setConvDrawerOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Conversations"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        <ConversationList
          conversations={conv.conversations}
          activeId={conv.activeConvId}
          onSelect={conv.handleSelectConversation}
          onDelete={conv.handleDeleteConversation}
          onNew={conv.handleNewConversation}
        />
      </SheetContent>
    </Sheet>
  );
}

export function ChatHeader({
  conv,
  messages,
  isLoading,
  onTriggerPipeline,
  onOpenMobileSidebar,
  mobileSidebarTriggerRef,
  onClearChat,
}: {
  conv: ReturnType<typeof useConversationManager>;
  messages: ReturnType<typeof useChat>["messages"];
  isLoading: boolean;
  onTriggerPipeline: () => void;
  onOpenMobileSidebar: () => void;
  mobileSidebarTriggerRef: React.RefObject<HTMLButtonElement | null>;
  onClearChat: () => void;
}) {
  const modelLabel = useMemo(
    () => getModelEntry(conv.settings.model)?.label ?? conv.settings.model,
    [conv.settings.model],
  );

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-3 lg:h-16 lg:px-4">
      <div className="flex items-center gap-2 lg:gap-3">
        <ConversationDrawer conv={conv} />
        <h1 className="hidden text-base font-bold lg:inline lg:text-lg">
          RP Sketcher
        </h1>
        <TurnCounter
          messages={messages}
          autoSummarizeInterval={conv.settings.autoSummarizeInterval}
          lastPipelineTurn={conv.lastPipelineTurn}
        />
        <p className="hidden text-xs text-muted-foreground lg:block">
          Model:{" "}
          <code className="rounded bg-muted px-1 py-0.5">{modelLabel}</code>
          <br />
          Quick n&apos; dirty RP interface for model testing
        </p>
      </div>
      <div className="flex items-center gap-1 lg:gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={conv.handleNewConversation}
          title="New chat"
          className="h-8 w-8 p-0 lg:h-9 lg:w-auto lg:px-3"
        >
          <Plus className="h-4 w-4 lg:mr-1" />
          <span className="hidden lg:inline">New</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onTriggerPipeline}
          disabled={messages.length < 2 || isLoading}
          title="Update Story State"
          className="h-8 w-8 p-0 lg:h-9 lg:w-auto lg:px-3"
        >
          <Sparkles className="h-4 w-4 lg:mr-1" />
          <span className="hidden lg:inline">Update State</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearChat}
          disabled={messages.length === 0}
          title="Clear chat"
          className="h-8 w-8 p-0 lg:h-9 lg:w-auto lg:px-3"
        >
          <Trash2 className="h-4 w-4 lg:mr-1" />
          <span className="hidden lg:inline">Clear</span>
        </Button>
        <Button
          ref={mobileSidebarTriggerRef}
          variant="outline"
          size="sm"
          onClick={onOpenMobileSidebar}
          title="Configure"
          className="h-8 w-8 p-0 lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
