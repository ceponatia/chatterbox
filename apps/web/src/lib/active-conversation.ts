const ACTIVE_CONV_KEY = "chatterbox_active_conv_id";

export function persistActiveConversationId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(ACTIVE_CONV_KEY, id);
    else sessionStorage.removeItem(ACTIVE_CONV_KEY);
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

export function readActiveConversationId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_CONV_KEY);
  } catch {
    return null;
  }
}
