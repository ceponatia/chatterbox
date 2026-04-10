import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logRequest, logError } from "@/lib/api-logger";
import type { UIMessage } from "ai";

const COOLDOWN_MS = 60_000;
const LEASE_DURATION_MS = 120_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastMessageId(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const last = messages[messages.length - 1] as UIMessage | undefined;
  return last?.id ?? null;
}

function hasNewMessages(
  messages: unknown,
  checkpointId: string | null,
): boolean {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (!checkpointId) return true;
  const last = messages[messages.length - 1] as UIMessage | undefined;
  return last?.id !== checkpointId;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleComplete(
  id: string,
  checkpointMessageId: string | undefined,
) {
  if (!checkpointMessageId) {
    return NextResponse.json(
      { error: "checkpointMessageId required" },
      { status: 400 },
    );
  }
  try {
    await prisma.conversation.update({
      where: { id },
      data: {
        lastStateUpdateAt: new Date(),
        lastStateCheckpointMessageId: checkpointMessageId,
        stateRefreshLeaseExpiresAt: null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("refresh-check complete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

async function handleCheck(
  id: string,
  conv: {
    messages: unknown;
    lastStateUpdateAt: Date | null;
    lastStateCheckpointMessageId: string | null;
    stateRefreshLeaseExpiresAt: Date | null;
  },
  leaseRenew: boolean,
) {
  const now = new Date();

  // Lease renewal for in-progress refresh
  if (
    leaseRenew &&
    conv.stateRefreshLeaseExpiresAt &&
    conv.stateRefreshLeaseExpiresAt > now
  ) {
    await prisma.conversation.update({
      where: { id },
      data: {
        stateRefreshLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
    });
    return NextResponse.json({ eligible: false, leaseRenewed: true });
  }

  const cooldownOk =
    !conv.lastStateUpdateAt ||
    now.getTime() - conv.lastStateUpdateAt.getTime() > COOLDOWN_MS;

  const leaseOk =
    !conv.stateRefreshLeaseExpiresAt || conv.stateRefreshLeaseExpiresAt <= now;

  const hasNew = hasNewMessages(
    conv.messages,
    conv.lastStateCheckpointMessageId,
  );

  if (cooldownOk && leaseOk && hasNew) {
    const checkpoint = lastMessageId(conv.messages);
    await prisma.conversation.update({
      where: { id },
      data: {
        stateRefreshLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
    });
    return NextResponse.json({
      eligible: true,
      checkpointMessageId: checkpoint,
    });
  }

  return NextResponse.json({ eligible: false });
}

// ---------------------------------------------------------------------------
// POST handler -- dispatch on `action` field
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;
  const body = (await request.json()) as {
    action?: "check" | "complete";
    leaseRenew?: boolean;
    checkpointMessageId?: string;
  };
  const action = body.action ?? "check";

  logRequest(`/api/conversations/${id}/refresh-check`, {
    action,
    leaseRenew: body.leaseRenew ?? false,
  });

  const conv = await prisma.conversation.findFirst({
    where: { id, userId },
    select: {
      id: true,
      messages: true,
      lastStateUpdateAt: true,
      lastStateCheckpointMessageId: true,
      stateRefreshLeaseExpiresAt: true,
    },
  });

  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "complete") {
    return handleComplete(id, body.checkpointMessageId);
  }

  return handleCheck(id, conv, body.leaseRenew ?? false);
}
