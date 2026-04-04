import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { logError } from "@/lib/api-logger";
import { prisma } from "@/lib/prisma";
import { signToken, buildSetCookieHeader } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { user?: string; password?: string };
  try {
    body = (await req.json()) as { user?: string; password?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { user, password } = body;
  if (typeof user !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Missing user or password" },
      { status: 400 },
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { username: user },
  });

  if (!dbUser || !(await compare(password, dbUser.passwordHash))) {
    logError("AUTH", new Error("Invalid login attempt"));
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  try {
    const token = await signToken(dbUser.id, dbUser.username);
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", buildSetCookieHeader(token));
    return res;
  } catch (err) {
    logError("AUTH", err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}
