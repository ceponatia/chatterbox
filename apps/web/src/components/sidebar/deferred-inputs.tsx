"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Input that maintains local state during typing and only commits to the
 * parent on blur. Prevents expensive parent re-renders and markdown
 * serialization from disrupting focus or eating whitespace mid-keystroke.
 */
export function DeferredInput({
  value: externalValue,
  onCommit,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange" | "onBlur" | "value"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(externalValue);
  const [prevExternal, setPrevExternal] = useState(externalValue);

  if (prevExternal !== externalValue) {
    setPrevExternal(externalValue);
    setLocalValue(externalValue);
  }

  return (
    <Input
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        if (localValue !== externalValue) onCommit(localValue);
      }}
    />
  );
}

/** Textarea variant of DeferredInput — same local-state-on-blur pattern. */
export function DeferredTextarea({
  value: externalValue,
  onCommit,
  ...props
}: Omit<
  React.ComponentProps<typeof Textarea>,
  "onChange" | "onBlur" | "value"
> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(externalValue);
  const [prevExternal, setPrevExternal] = useState(externalValue);

  if (prevExternal !== externalValue) {
    setPrevExternal(externalValue);
    setLocalValue(externalValue);
  }

  return (
    <Textarea
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        if (localValue !== externalValue) onCommit(localValue);
      }}
    />
  );
}
