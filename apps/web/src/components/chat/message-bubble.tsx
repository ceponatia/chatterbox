"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { UIMessage } from "ai";
import { User, BookOpen, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ConfirmDeleteButton,
  ConfirmTruncateButton,
} from "@/components/ui/confirm-delete-button";
import { ReasoningBlock } from "./reasoning-block";

export interface MessageBubbleProps {
  message: UIMessage;
  canRetry: boolean;
  isLastMessage: boolean;
  isLoading: boolean;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onDeleteAfter: (id: string) => void;
  onRetry: (id: string) => void;
  onEditAndGenerate: (id: string, newText: string) => void;
}

function getTextContent(message: UIMessage): string {
  if (!message.parts) return "";
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

function getMergedReasoning(
  message: UIMessage,
  isUser: boolean,
): { text: string; state: "done" | "streaming" } | null {
  if (isUser) return null;

  const reasoningParts = (message.parts ?? []).filter(
    (part): part is Extract<typeof part, { type: "reasoning" }> =>
      part.type === "reasoning",
  );
  if (reasoningParts.length === 0) return null;

  return {
    text: reasoningParts.map((part) => part.text).join("\n\n"),
    state: reasoningParts.every((part) => part.state === "done")
      ? "done"
      : "streaming",
  };
}

function MessageContent({
  editing,
  mergedReasoning,
  text,
  editText,
  setEditText,
  onSave,
  onSaveAndGenerate,
  onCancel,
}: {
  editing: boolean;
  mergedReasoning: { text: string; state: "done" | "streaming" } | null;
  text: string;
  editText: string;
  setEditText: (value: string) => void;
  onSave: () => void;
  onSaveAndGenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {mergedReasoning && (
        <div className="mb-1">
          <ReasoningBlock
            text={mergedReasoning.text}
            state={mergedReasoning.state}
          />
        </div>
      )}
      {editing ? (
        <EditForm
          editText={editText}
          setEditText={setEditText}
          onSave={onSave}
          onSaveAndGenerate={onSaveAndGenerate}
          onCancel={onCancel}
        />
      ) : (
        <div className="whitespace-pre-wrap">{text}</div>
      )}
    </>
  );
}

function MobileActionButtons({
  isUser,
  visible,
  canRetry,
  isLastMessage,
  messageId,
  onEdit,
  onRetry,
  onDelete,
  onDeleteAfter,
}: {
  isUser: boolean;
  visible: boolean;
  canRetry: boolean;
  isLastMessage: boolean;
  messageId: string;
  onEdit: () => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAfter: (id: string) => void;
}) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap gap-1.5 lg:hidden",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <Button
        variant="outline"
        size="sm"
        className="relative h-7 gap-1 px-2 text-xs before:absolute before:-inset-2 before:content-['']"
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          className="relative h-7 gap-1 px-2 text-xs before:absolute before:-inset-2 before:content-['']"
          onClick={() => onRetry(messageId)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      )}
      {!isLastMessage && (
        <ConfirmTruncateButton onConfirm={() => onDeleteAfter(messageId)} />
      )}
      <ConfirmDeleteButton onConfirm={() => onDelete(messageId)} />
    </div>
  );
}

export function MessageBubble({
  message,
  canRetry,
  isLastMessage,
  isLoading,
  onEdit,
  onDelete,
  onDeleteAfter,
  onRetry,
  onEditAndGenerate,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const text = getTextContent(message);
  const mergedReasoning = getMergedReasoning(message, isUser);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const showActions = !editing && !isLoading;

  function startEditing() {
    setEditText(text);
    setEditing(true);
  }

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <RoleAvatar isUser={isUser} />
      <div
        className={cn(
          "app-message-surface",
          isUser ? "app-message-surface-user" : "app-message-surface-assistant",
        )}
      >
        {showActions && (
          <ActionButtons
            isUser={isUser}
            canRetry={canRetry}
            canTruncate={!isLastMessage}
            messageId={message.id}
            onEdit={startEditing}
            onRetry={onRetry}
            onDelete={onDelete}
            onDeleteAfter={onDeleteAfter}
          />
        )}
        <MessageContent
          editing={editing}
          mergedReasoning={mergedReasoning}
          text={text}
          editText={editText}
          setEditText={setEditText}
          onSave={() => {
            onEdit(message.id, editText);
            setEditing(false);
          }}
          onSaveAndGenerate={() => {
            onEditAndGenerate(message.id, editText);
            setEditing(false);
          }}
          onCancel={() => {
            setEditText(text);
            setEditing(false);
          }}
        />
        <MobileActionButtons
          isUser={isUser}
          visible={showActions}
          canRetry={canRetry}
          isLastMessage={isLastMessage}
          messageId={message.id}
          onEdit={startEditing}
          onRetry={onRetry}
          onDelete={onDelete}
          onDeleteAfter={onDeleteAfter}
        />
      </div>
    </div>
  );
}

interface ActionButtonsProps {
  isUser: boolean;
  canRetry: boolean;
  canTruncate: boolean;
  messageId: string;
  onEdit: () => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAfter: (id: string) => void;
}

function ActionButtons(props: ActionButtonsProps) {
  const {
    isUser,
    canRetry,
    canTruncate,
    messageId,
    onEdit,
    onRetry,
    onDelete,
    onDeleteAfter,
  } = props;

  return (
    <div className={cn("app-message-toolbar", isUser ? "left-0" : "right-0")}>
      <Button
        variant="ghost"
        size="sm"
        className="relative h-6 w-6 p-0 text-muted-foreground hover:text-foreground before:absolute before:-inset-2 before:content-['']"
        title="Edit"
        onClick={onEdit}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      {canRetry && (
        <Button
          variant="ghost"
          size="sm"
          className="relative h-6 w-6 p-0 text-muted-foreground hover:text-foreground before:absolute before:-inset-2 before:content-['']"
          title="Retry"
          onClick={() => onRetry(messageId)}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
      {canTruncate && (
        <ConfirmTruncateButton onConfirm={() => onDeleteAfter(messageId)} />
      )}
      <ConfirmDeleteButton onConfirm={() => onDelete(messageId)} />
    </div>
  );
}

function RoleAvatar({ isUser }: { isUser: boolean }) {
  return (
    <div
      className={cn(
        "app-message-avatar",
        isUser ? "app-message-avatar-user" : "app-message-avatar-assistant",
      )}
    >
      {isUser ? <User className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
    </div>
  );
}

function EditForm({
  editText,
  setEditText,
  onSave,
  onSaveAndGenerate,
  onCancel,
}: {
  editText: string;
  setEditText: (v: string) => void;
  onSave: () => void;
  onSaveAndGenerate: () => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(editText.length, editText.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={textareaRef}
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        className="min-h-20 bg-background text-foreground text-xs font-mono"
      />
      <div className="flex justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="relative h-6 text-xs before:absolute before:-inset-2 before:content-['']"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="relative h-6 text-xs before:absolute before:-inset-2 before:content-['']"
          onClick={onSave}
        >
          Save
        </Button>
        <Button
          size="sm"
          className="relative h-6 text-xs before:absolute before:-inset-2 before:content-['']"
          onClick={onSaveAndGenerate}
        >
          Save & Generate
        </Button>
      </div>
    </div>
  );
}
