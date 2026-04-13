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

export async function GET(request: Request) {
  logRequest("/api/presets", { method: "GET" });
  const userId = getUserId(request);
  const presets = await prisma.settingsPreset.findMany({
    where: { userId },
    select: presetSelect,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(presets);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    settings?: Settings;
    isDefault?: boolean;
  } | null;
  logRequest("/api/presets", { method: "POST", body });
  const userId = getUserId(request);

  const name = body?.name?.trim();
  const settings = body?.settings;
  if (!body || !name || !isSettingsObject(settings)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const shouldSetDefault = body.isDefault === true;
  const created = await prisma.$transaction(async (tx) => {
    if (shouldSetDefault) {
      await tx.settingsPreset.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return tx.settingsPreset.create({
      data: {
        userId,
        name,
        settings: toSettingsJson(settings),
        isDefault: shouldSetDefault,
      },
      select: presetSelect,
    });
  });

  return NextResponse.json(created);
}
