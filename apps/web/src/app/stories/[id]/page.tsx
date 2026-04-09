import { StoryEditorClient } from "@/components/story/story-editor-client";

export default async function StoryProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoryEditorClient storyId={id} />;
}
