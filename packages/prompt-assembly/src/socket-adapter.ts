/**
 * Socket adapter — bridges the PromptAssembler to the PromptAssemblySocket
 * interface defined in @chatterbox/sockets.
 *
 * This allows the app to swap in the segmented assembler through the same
 * socket contract used by the default (monolithic) implementation.
 */

import type { PromptAssemblySocket, AssemblyResult } from "@chatterbox/sockets";
import type { AssemblyContext } from "@chatterbox/sockets";
import { createDefaultAssembler } from "./segments";

const assembler = createDefaultAssembler();

/**
 * A PromptAssemblySocket implementation backed by the segmented assembler.
 *
 * The `systemPrompt` and `storyState` params from the socket interface are
 * ignored in favor of the registered segments. Story state is still appended
 * separately by the caller (route handler) as described in the plan.
 */
export const segmentedPromptAssembly: PromptAssemblySocket = {
  assemble(_systemPrompt: string, _storyState: string, context: AssemblyContext): AssemblyResult {
    return assembler.assemble(context);
  },
};
