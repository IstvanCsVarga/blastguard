import { auth0 } from "@/lib/auth0";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function middleware(req: NextRequest) {
  // Auth0 SDK must process ALL matched requests for session management
  const authRes = await auth0.middleware(req);

  // Auth routes (/auth/login, /auth/callback, /auth/logout) are handled by Auth0
  if (req.nextUrl.pathname.startsWith("/auth") || req.nextUrl.pathname.startsWith("/api/auth")) {
    return authRes ?? NextResponse.next();
  }

  // API routes don't require auth (agent needs access)
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Protected pages: /incidents/* -- require login on production
  if (req.nextUrl.pathname.startsWith("/incidents") && process.env.NODE_ENV !== "development") {
    try {
      const session = await auth0.getSession(req);
      if (!session) {
        return NextResponse.redirect(new URL("/auth/login?returnTo=/incidents", req.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/auth/login?returnTo=/incidents", req.url));
    }
  }

  return authRes ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/api/auth/:path*",
    "/incidents/:path*",
  ],
};
