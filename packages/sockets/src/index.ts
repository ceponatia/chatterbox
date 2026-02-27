/**
 * @chatterbox/sockets — Public API
 *
 * This is the ONLY entry point for consuming socket types and defaults.
 * All imports from @chatterbox/sockets must go through this barrel.
 */

// Types
export type {
  SocketMessage,
  AssemblyContext,
  StateUpdateRequest,
  StateUpdateResult,
  ValidationReport,
  PostResponseContext,
} from "./types";

// Prompt Assembly
export type { PromptAssemblySocket, AssemblyResult } from "./prompt-assembly";
export { defaultPromptAssembly } from "./prompt-assembly";

// Message Processing
export type { MessageProcessingSocket, MessageProcessingResult } from "./message-processing";
export { defaultMessageProcessing } from "./message-processing";

// State Update
export type { StateUpdateSocket, StateValidationSocket } from "./state-update";
export { defaultStateUpdate, defaultStateValidation } from "./state-update";

// Post-Response Hook
export type { PostResponseSocket } from "./post-response";
export { defaultPostResponse } from "./post-response";
