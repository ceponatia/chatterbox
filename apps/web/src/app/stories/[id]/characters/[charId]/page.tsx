import { CharacterBuilderClient } from "@/components/story/character-builder-client";

export default async function CharacterBuilderPage({
  params,
}: {
  params: Promise<{ id: string; charId: string }>;
}) {
  const { id, charId } = await params;
  return <CharacterBuilderClient storyId={id} characterId={charId} />;
}
