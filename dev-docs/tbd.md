# Idea Document (TBD)

## Overview

Add tbd items here. When a decent number are ready, create a plan document for them and then move the lines to a section called "Completed in Phase 2" or "Completed in Phase 3", etc.

## Phase 2 Ideas

## Completed in Phase 2

- Further parse the story state and system prompt areas in the UI and in the prompt assembly code to make them more readable and easier to work with, but also potentially more useful for inference. For example, in the `cast` section of the story state, we could have a separate sub-container for each NPC and the player which can be edited separately without accidentally affecting other actors. The same atomization can be thought about for other sections and the system prompt (which is currently not broken up the way story state is)

## Completed in Phase 1

- A system to load quotes and conversation snippets for NPCs that the LLM uses for examples when writing dialogue. → see `plan-npc-systems.md` §1
- A system for intelligently determining the NPCs attitude toward the player and keeping it tracked in state, changing it when necessary. It should be able to move bi-directionally (closer affinity and more rapport, or more distance and less rapport). → see `plan-npc-systems.md` §2
- Track how many turns since the narrative mentioned the NPCs appearance and attire, and after n turns, have the LLM write narrative to refresh the reader's memory. The 'appearance' field should be able to be updated intelligently by the LLM when the NPC changes their appearance. → see `plan-npc-systems.md` §3
- Auto retry when chat endpoint returns 0 tokens, with provider rotation through the preferred order list. → see `plan-npc-systems.md` §4

- Import button on Story State and System Prompt tabs: opens file picker for `.json`/`.md`, loads raw content into editor, sets it as the per-conversation baseline. Every re-import overwrites the baseline. Reset reverts to baseline; summarizations and manual edits don't affect it. New chats start blank.
- Currently the story state update uses a modal that pops up when generating a state update and then a Review pop up for the user to confirm. This interrupts the chat flow so ultimately we will want this modal to go into a side menu or something like that.
- Add a 'last updated' date and time to the Story State sidebar.
- Edit and delete buttons on chat messages (hover to reveal action bar). Edit mode with inline textarea.
- Retry button on last user/assistant message pair (V1). Truncates and re-sends.
- "Save & Generate" button in edit mode that saves edits then triggers retry/regeneration.
