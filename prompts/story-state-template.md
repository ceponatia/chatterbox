# Story State Template

<!-- Notes:
  - Section headings (## Cast, ## Relationships, ## Characters, etc.) must
    match the names the entity-centric state model expects. Do not rename them.
  - Cast entries: one line per character — age, role, one-sentence situation.
    Personality and speech behavior belong in the system prompt, not here.
  - Characters section groups data by character using ### headings, then
    sub-sections with #### headings (Appearance, Personality, etc.).
    Appearance entries use comma-separated values for token efficiency:
      - **attribute**: value, value, value
    Attributes are freeform (eyes, hair, outfit, build, etc.). Use short
    descriptors separated by commas, not full sentences.
  - Hard Facts are absolute constraints the narrator must never contradict.
  - There is no Style section. Narration guidance belongs in the system prompt
    (Voice and speech / Interaction guidelines), not here where the state
    pipeline can overwrite it.
-->

## Cast

- **{{ char }}** — [age], [occupation]. [one sentence: current situation or goal]
- **{{ user }}** — [player character, do not narrate]. [brief physical description]
- **[NPC name]** — [role, relationship to other characters]

## Relationships

- **{{ char }} → {{ user }}**: [how they know each other, current dynamic, trust level]
- **{{ char }} → [NPC]**: [nature of relationship, relevant history]

## Characters

### {{ char }}

#### Appearance

- **eyes**: [color, shape, notable features]
- **hair**: [color, length, style]
- **face**: [shape, complexion, notable features]
- **build**: [height, frame, physique]
- **outfit**: [current clothing, accessories]
- **vibe**: [general presentation, energy]

## Scene

- **Where/When**: [location and time — filled during play]
- **Who is present**: {{ char }}, {{ user }}
- **Atmosphere**: [mood of the scene — filled during play]

## Current Demeanor

- **{{ char }}'s mood**: [filled during play]
- **Energy between them**: [filled during play]

## Open Threads

- [active plot thread or unresolved situation]

## Hard Facts

- [established fact that must not be contradicted]
- [another immutable detail]
