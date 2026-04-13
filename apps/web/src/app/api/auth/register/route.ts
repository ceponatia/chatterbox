import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { logError } from "@/lib/api-logger";
import { prisma } from "@/lib/prisma";
import { signToken, buildSetCookieHeader } from "@/lib/auth";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;
const MIN_PASSWORD_LENGTH = 8;

interface RegisterInput {
  username: string;
  password: string;
  email?: string | null;
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function validateInput(body: unknown): NextResponse | RegisterInput {
  if (!body || typeof body !== "object") {
    return errorResponse("Invalid request body", 400);
  }

  const { username, password, email } = body as {
    username?: string;
    password?: string;
    email?: string | null;
  };

  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return errorResponse(
      "Username must be 3-50 characters and contain only letters, numbers, underscores, or hyphens",
      400,
    );
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return errorResponse("Password must be at least 8 characters", 400);
  }

  if (
    email !== undefined &&
    email !== null &&
    (typeof email !== "string" || !email.includes("@") || !email.includes("."))
  ) {
    return errorResponse("Invalid email format", 400);
  }

  return { username, password, email };
}

async function seedDefaultPresets(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.settingsPreset.createMany({
    data: [
      {
        userId,
        name: "Creative",
        isDefault: false,
        settings: {
          model: "z-ai/glm-5",
          temperature: 1.0,
          maxTokens: 1500,
          topP: 1,
          frequencyPenalty: 0.3,
          presencePenalty: 0,
          autoSummarizeInterval: 15,
          tokenBudget: 5000,
        },
      },
      {
        userId,
        name: "Balanced",
        isDefault: true,
        settings: {
          model: "z-ai/glm-5",
          temperature: 0.85,
          maxTokens: 1500,
          topP: 1,
          frequencyPenalty: 0,
          presencePenalty: 0,
          autoSummarizeInterval: 15,
          tokenBudget: 5000,
        },
      },
      {
        userId,
        name: "Precise",
        isDefault: false,
        settings: {
          model: "z-ai/glm-5",
          temperature: 0.6,
          maxTokens: 1500,
          topP: 1,
          frequencyPenalty: 0.5,
          presencePenalty: 0,
          autoSummarizeInterval: 15,
          tokenBudget: 5000,
        },
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const validated = validateInput(body);
  if (validated instanceof NextResponse) {
    return validated;
  }

  const { username, password, email } = validated;

  const existingUser = await prisma.user.findUnique({
    where: { username },
  });
  if (existingUser) {
    return errorResponse("Username already taken", 409);
  }

  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      return errorResponse("Email already in use", 409);
    }
  }

  try {
    const passwordHash = await hash(password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          ...(email ? { email } : {}),
        },
      });

      await seedDefaultPresets(tx, user.id);

      return user;
    });

    const token = await signToken(newUser.id, newUser.username);
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", buildSetCookieHeader(token));
    return res;
  } catch (err) {
    logError("AUTH", err instanceof Error ? err : new Error(String(err)));
    return errorResponse("Registration failed", 500);
  }
}
