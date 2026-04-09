import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  // Auth is opt-in via AUTH_ENABLED env var
  if (process.env.AUTH_ENABLED !== "true") return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;

  if (payload) {
    // Inject userId into request headers so API routes can read it
    const headers = new Headers(req.headers);
    headers.set("x-user-id", payload.userId);
    return NextResponse.next({ request: { headers } });
  }

  // Unauthenticated: API routes get 401 JSON, pages get redirected
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - /login (the login page itself)
     * - /api/auth/* (login/logout endpoints)
     * - /_next/* (static assets, HMR)
     * - /favicon.ico
     */
    "/((?!login|api/auth|_next|favicon\\.ico).*)",
  ],
};