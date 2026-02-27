import type { PromptSegment } from "../types";

export const outfitHairstyleSegment: PromptSegment = {
  id: "outfit_hairstyle",
  label: "Outfit & Hairstyle",
  content: `- Outfit:
  - She wears a soft, blush-pink longline blazer that falls to mid-thigh, worn open rather than buttoned. Underneath is a light-colored graphic T-shirt with a subtle, playful illustration centered on the chest. The overall look is casual-polished, blending relaxed comfort with a feminine, styled presentation. On her feet are light-colored open-toe heels with a thin ankle strap, adding a dressy touch without appearing formal. No prominent accessories are visible beyond possibly a delicate bracelet or watch.
- Hairstyle:
  - Her hair is long and blonde with darker roots, styled in loose, natural waves. The part is slightly off-center, allowing the hair to frame her face evenly on both sides. The texture appears soft and lightly styled rather than rigidly curled, giving a youthful, approachable look. Hair falls past her shoulders and down her back with gentle volume.`,
  policy: { type: "on_topic", keywords: ["outfit", "wear", "clothes", "dress", "shirt", "jacket", "blazer", "shoes", "heels", "hairstyle", "styled"] },
  priority: "normal",
  order: 56,
  tokenEstimate: 250,
  category: "character",
};
