import { Textarea } from "@/components/ui/textarea";

export function StoryReadonlyBlock({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string | null;
  placeholder: string;
}) {
  return (
    <div className="app-editor-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="app-editor-summary">
          {value?.trim() ? `${value.trim().length} chars` : "empty"}
        </span>
      </div>
      <Textarea
        value={value ?? ""}
        readOnly={true}
        placeholder={placeholder}
        className="min-h-40 font-mono text-xs leading-relaxed"
      />
    </div>
  );
}
