/**
 * Message Processing Socket
 *
 * Defines the interface for preprocessing the message array before it is
 * sent to the inference endpoint. The default implementation reproduces the
 * current `windowMessages()` behavior (flat recency slice).
 */

import type { SocketMessage } from "./types";

// ---------------------------------------------------------------------------
// Processing result
// ---------------------------------------------------------------------------

export interface MessageProcessingResult {
  /** The processed messages to send to the model */
  readonly messages: readonly SocketMessage[];

  /** How many messages were in the original input */
  readonly originalCount: number;

  /** How many messages are in the output */
  readonly outputCount: number;

  /** Optional digest of compressed/omitted messages (injected as context) */
  readonly historyDigest: string | null;
}

// ---------------------------------------------------------------------------
// Socket interface
// ---------------------------------------------------------------------------

export interface MessageProcessingSocket {
  /**
   * Process a raw message array into a model-ready message array.
   *
   * @param messages       Full conversation message history
   * @param maxMessages    Maximum messages to include (from settings)
   * @returns              Processed messages + metadata
   */
  process(
    messages: readonly SocketMessage[],
    maxMessages: number,
  ): MessageProcessingResult;
}

// ---------------------------------------------------------------------------
// Default implementation — reproduces current windowMessages() behavior
// ---------------------------------------------------------------------------

const DEFAULT_MAX_MESSAGES = 40;

export const defaultMessageProcessing: MessageProcessingSocket = {
  process(messages, maxMessages = DEFAULT_MAX_MESSAGES) {
    const sliced =
      messages.length <= maxMessages
        ? messages
        : messages.slice(-maxMessages);

    return {
      messages: sliced,
      originalCount: messages.length,
      outputCount: sliced.length,
      historyDigest: null,
    };
  },
};
