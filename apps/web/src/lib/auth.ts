import { env } from "./env";

export const AUTH_COOKIE_NAME = "chatterbox_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface TokenPayload {
  userId: string;
  user: string;
  exp: number;
}

const encoder = new TextEncoder();

async function getKey(): Promise<CryptoKey> {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  const keyData = encoder.encode(env.SESSION_SECRET);
  return crypto.subtle.importKey(
    "raw",
    keyData.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

export async function signToken(userId: string, user: string): Promise<string> {
  const payload: TokenPayload = {
    userId,
    user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const payloadB64 = base64url(payloadBytes.buffer as ArrayBuffer);
  const key = await getKey();
  const data = encoder.encode(payloadB64);
  const sig = await crypto.subtle.sign("HMAC", key, data.buffer as ArrayBuffer);
  return `${payloadB64}.${base64url(sig)}`;
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts as [string, string];

  try {
    const key = await getKey();
    const sigBuf = base64urlDecode(sigB64);
    const dataBuf = encoder.encode(payloadB64).buffer as ArrayBuffer;
    const valid = await crypto.subtle.verify("HMAC", key, sigBuf, dataBuf);
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(new Uint8Array(base64urlDecode(payloadB64))),
    ) as TokenPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildSetCookieHeader(token: string): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookieHeader(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
