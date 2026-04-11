import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import type { CandidateFact } from "@chatterbox/sockets";
import {
  applyStructuralRepairs,
  parseMarkdownToStructured,
  structuredToMarkdown,
  validateStructuralIntegrity,
} from "@chatterbox/state-model";
import { log, logError, logRequest } from "@/lib/api-logger";
import { getUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";
import { slowLaneReconciliationAdapter } from "@/lib/state-pipeline/slow-lane-socket";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCandidateFacts(raw: unknown): CandidateFact[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = entry.id;
    const content = entry.content;
    const confidence = entry.confidence;
    if (
      typeof id !== "string" ||
      typeof content !== "string" ||
      typeof confidence !== "number" ||
      Number.isNaN(confidence)
    ) {
      return [];
    }

    return [
      {
        id,
        content,
        confidence,
        sourceMessageId:
          typeof entry.sourceMessageId === "string"
            ? entry.sourceMessageId
            : "unknown",
        extractedAt:
          typeof entry.extractedAt === "string"
            ? entry.extractedAt
            : new Date().toISOString().slice(0, 10),
      },
    ];
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;

  logRequest(`/api/conversations/${id}/slow-lane`, { method: "POST" });

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        storyState: true,
        candidateFacts: true,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (conversation.storyState.trim().length === 0) {
      return NextResponse.json(
        { error: "No story state to reconcile" },
        { status: 400 },
      );
    }

    const candidateFacts = parseCandidateFacts(conversation.candidateFacts);
    if (candidateFacts.length === 0) {
      return NextResponse.json({
        ok: true,
        summary: "No candidate facts to reconcile.",
        promoted: 0,
        rejected: 0,
        retained: 0,
        supersessions: 0,
        threadReconciliations: 0,
        repaired: false,
      });
    }

    log(
      `slow-lane: starting reconciliation for ${id} with ${candidateFacts.length} candidates`,
    );

    const result = await slowLaneReconciliationAdapter.reconcile({
      currentStoryState: conversation.storyState,
      candidateFacts,
    });

    let finalState = result.updatedState;
    let repaired = false;

    try {
      const structuredState = parseMarkdownToStructured(finalState);
      const integrityReport = validateStructuralIntegrity(structuredState);

      if (integrityReport.issues.length > 0) {
        log(
          `slow-lane: structural validation found ${integrityReport.issues.length} issues for ${id}`,
        );

        const repairResult = applyStructuralRepairs(
          structuredState,
          integrityReport,
        );
        finalState = structuredToMarkdown(repairResult.state);
        repaired = repairResult.applied.length > 0;

        if (repairResult.applied.length > 0) {
          log(
            `slow-lane: applied ${repairResult.applied.length} structural repairs for ${id}`,
          );
        }
      }
    } catch (validationError) {
      logError(
        "slow-lane: structural validation failed; using unvalidated state",
        validationError,
      );
    }

    const remainingCandidates = candidateFacts.filter((candidateFact) => {
      const decision = result.candidateDecisions.find(
        (entry) => entry.candidateId === candidateFact.id,
      );
      return !decision || decision.verdict === "retained";
    });

    await prisma.conversation.update({
      where: { id },
      data: {
        storyState: finalState,
        lastSlowLaneAt: new Date(),
        candidateFacts: remainingCandidates as unknown as Prisma.InputJsonValue,
      },
    });

    const promoted = result.candidateDecisions.filter(
      (decision) => decision.verdict === "promoted",
    ).length;
    const rejected = result.candidateDecisions.filter(
      (decision) => decision.verdict === "rejected",
    ).length;
    const retained = remainingCandidates.length;

    log(
      `slow-lane: completed for ${id} -- ${promoted} promoted, ${rejected} rejected, ${retained} retained`,
    );

    return NextResponse.json({
      ok: true,
      summary: result.summary,
      promoted,
      rejected,
      retained,
      supersessions: result.supersessions.length,
      threadReconciliations: result.threadReconciliations.length,
      repaired,
    });
  } catch (error) {
    logError("slow-lane: route error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
