"use client";

import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RotateCcw, Upload } from "lucide-react";

interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onImport: (content: string) => void;
  onReset: () => void;
  baseline: string | null;
}

export function SystemPromptEditor({ value, onChange, onImport, onReset, baseline }: SystemPromptEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onImport(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">System Prompt</Label>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.md"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            title="Import from .json or .md file"
          >
            <Upload className="mr-1 h-3 w-3" />
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={baseline === null}
            title={baseline !== null ? "Reset to imported baseline" : "Import a file first"}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        RP rules and narration style. Sent as the system message every request.
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-64 font-mono text-xs leading-relaxed"
        placeholder="Enter your system prompt..."
      />
    </div>
  );
}
