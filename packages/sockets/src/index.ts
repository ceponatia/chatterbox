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
  StatePipelineRequest,
  StatePipelineValidation,
  StatePipelineChange,
  StatePipelineDisposition,
  StatePipelineResult,
  PostResponseContext,
} from "./types";

// Prompt Assembly
export type { PromptAssemblySocket, AssemblyResult } from "./prompt-assembly";
export { defaultPromptAssembly } from "./prompt-assembly";

// Message Processing
export type {
  MessageProcessingSocket,
  MessageProcessingResult,
} from "./message-processing";
export { defaultMessageProcessing } from "./message-processing";

// State Pipeline
export type { StatePipelineSocket } from "./state-update";
export { defaultStatePipeline } from "./state-update";

// Post-Response Hook
export type { PostResponseSocket } from "./post-response";
export { defaultPostResponse } from "./post-response";
