import { env } from "@/lib/env";

/** Deterministic fallback ID used when auth is disabled. */
const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Extract the authenticated user's ID from the request headers.
 * The middleware injects `x-user-id` after verifying the session cookie.
 * When AUTH_ENABLED is false, returns a deterministic local fallback ID.
 */
export function getUserId(req: Request): string {
  const userId = req.headers.get("x-user-id");
  if (userId) return userId;

  if (!env.AUTH_ENABLED) return LOCAL_USER_ID;

  throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
