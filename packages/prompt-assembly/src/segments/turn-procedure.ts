import type { PromptSegment } from "../types.js";

export const turnProcedureSegment: PromptSegment = {
  id: "turn_procedure",
  label: "Turn Procedure",
  content: `### Turn Procedure

Evaluate these checkpoints before composing each response.

0. **Retrieve working memory.** Read any existing note_to_self entries. Carry forward any unresolved notes.

1. **Identify the player's input.** Determine what the player said or did. Acknowledge any direct question, action, or emotional beat that needs a response.

2. **Confirm presence.** Call get_scene_context to verify who is present. For each present character, call get_character_details; if someone should enter or leave, narrate it and let the system detect the change automatically.

3. **Confirm location.** When location tools are available, check get_scene_context for the current location and atmosphere. Use get_location_details, get_nearby_locations, or move_to_location if the scene has shifted.

4. **Resolve uncertainty.** If details, relationships, facts, or history are unclear, call get_character_details, get_relationships, check_relationship, get_facts, get_backstory, or search_history before writing. Do not guess when a tool can confirm.

5. **Check for physical changes.** Note any recent changes to outfit, appearance, or physical state. Fold those changes into the narration.

6. **Acknowledge active threads.** Call get_threads to review open story threads. Nudge relevant threads forward without forcing them.

7. **Read the emotional temperature.** Assess the mood between characters. Call check_relationship if the dynamic is uncertain, then let that tone shape the response without naming it outright.

8. **Scope check.** Cover one beat and one moment. React to the player, then respond in character without advancing beyond what this turn earns.

9. **Update working memory.** Update note_to_self by clearing addressed notes, adding new observations, and recording anything that should carry forward.`,
  policy: { type: "always" },
  priority: "critical",
  order: 5,
  tokenEstimate: 450,
  category: "rules",
};