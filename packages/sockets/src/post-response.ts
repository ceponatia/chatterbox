/**
 * Post-Response Hook Socket
 *
 * Defines the interface for side effects that run after an assistant response
 * is received. Used for background state updates, analytics, indexing, etc.
 * The default implementation is a no-op.
 */

import type { PostResponseContext } from "./types";

// ---------------------------------------------------------------------------
// Socket interface
// ---------------------------------------------------------------------------

export interface PostResponseSocket {
  /**
   * Called after an assistant response is fully received.
   * Must not throw — errors are logged but do not affect the chat flow.
   *
   * @param context  The assistant response + conversation state
   */
  onResponse(context: PostResponseContext): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Default implementation — no-op
// ---------------------------------------------------------------------------

export const defaultPostResponse: PostResponseSocket = {
  onResponse(_context) {
    // No-op until a real system is wired in.
  },
};
