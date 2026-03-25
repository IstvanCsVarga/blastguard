import { auth0 } from "@/lib/auth0";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function middleware(req: NextRequest) {
  // Let Auth0 handle its own routes
  if (req.nextUrl.pathname.startsWith("/auth") || req.nextUrl.pathname.startsWith("/api/auth")) {
    const authRes = await auth0.middleware(req);
    if (authRes) return authRes;
    return NextResponse.next();
  }

  // API routes don't require auth (agent needs access)
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Protected pages: /incidents/*
  if (req.nextUrl.pathname.startsWith("/incidents")) {
    // Skip auth check in development for easier testing
    if (process.env.NODE_ENV === "development") {
      return NextResponse.next();
    }

    try {
      const session = await auth0.getSession(req);
      if (!session) {
        return NextResponse.redirect(new URL("/auth/login?returnTo=/incidents", req.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/auth/login?returnTo=/incidents", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/api/auth/:path*",
    "/incidents/:path*",
  ],
};
