import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logRequest } from "@/lib/api-logger";
import type { Settings } from "@/lib/defaults";

const presetSelect = {
  id: true,
  name: true,
  settings: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isSettingsObject(value: unknown): value is Settings {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSettingsJson(settings: Settings): Prisma.InputJsonValue {
  return settings as unknown as Prisma.InputJsonValue;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/presets/[id]", { method: "GET", id });
  const userId = getUserId(request);
  const preset = await prisma.settingsPreset.findFirst({
    where: { id, userId },
    select: presetSelect,
  });

  if (!preset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(preset);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    name?: string;
    settings?: Settings;
    isDefault?: boolean;
  } | null;
  logRequest("/api/presets/[id]", { method: "PUT", id, body });
  const userId = getUserId(request);

  if (!body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (body.name !== undefined && !name) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (body.settings !== undefined && !isSettingsObject(body.settings)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.settingsPreset.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      return null;
    }

    if (body.isDefault === true) {
      await tx.settingsPreset.updateMany({
        where: {
          userId,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    return tx.settingsPreset.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(body.settings !== undefined
          ? { settings: toSettingsJson(body.settings) }
          : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      },
      select: presetSelect,
    });
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/presets/[id]", { method: "DELETE", id });
  const userId = getUserId(request);
  const existing = await prisma.settingsPreset.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.settingsPreset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
