"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { UIMessage } from "ai";
import { User, BookOpen, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { ReasoningBlock } from "./reasoning-block";

export interface MessageBubbleProps {
  message: UIMessage;
  canRetry: boolean;
  isLoading: boolean;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
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

export function MessageBubble({
  message,
  canRetry,
  isLoading,
  onEdit,
  onDelete,
  onRetry,
  onEditAndGenerate,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const text = getTextContent(message);
  const reasoningParts = isUser
    ? []
    : (message.parts ?? []).filter(
        (p): p is Extract<typeof p, { type: "reasoning" }> =>
          p.type === "reasoning",
      );
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);

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
          "relative max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm",
        )}
      >
        {!editing && !isLoading && (
          <ActionButtons
            isUser={isUser}
            canRetry={canRetry}
            messageId={message.id}
            onEdit={() => {
              setEditText(text);
              setEditing(true);
            }}
            onRetry={onRetry}
            onDelete={onDelete}
          />
        )}
        {reasoningParts.length > 0 && (
          <div className="mb-1">
            {reasoningParts.map((part, i) => (
              <ReasoningBlock key={i} text={part.text} state={part.state} />
            ))}
          </div>
        )}
        {editing ? (
          <EditForm
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
        ) : (
          <div className="whitespace-pre-wrap">{text}</div>
        )}
        {!editing && !isLoading && (
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
              onClick={() => {
                setEditText(text);
                setEditing(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                className="relative h-7 gap-1 px-2 text-xs before:absolute before:-inset-2 before:content-['']"
                onClick={() => onRetry(message.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            )}
            <ConfirmDeleteButton onConfirm={() => onDelete(message.id)} />
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButtons({
  isUser,
  canRetry,
  messageId,
  onEdit,
  onRetry,
  onDelete,
}: {
  isUser: boolean;
  canRetry: boolean;
  messageId: string;
  onEdit: () => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "absolute -top-2 hidden gap-0.5 rounded-md border bg-background p-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 lg:flex",
        isUser ? "left-0" : "right-0",
      )}
    >
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
      <ConfirmDeleteButton onConfirm={() => onDelete(messageId)} />
    </div>
  );
}

function RoleAvatar({ isUser }: { isUser: boolean }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
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
