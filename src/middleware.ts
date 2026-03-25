import { auth0 } from "@/lib/auth0";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const authRes = await auth0.middleware(req);

  // If it's an auth route, let Auth0 handle it
  if (req.nextUrl.pathname.startsWith("/auth")) {
    return authRes;
  }

  // API routes for incidents don't require auth in dev (for demo purposes)
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return authRes;
  }

  // Protected pages: /incidents/*
  if (req.nextUrl.pathname.startsWith("/incidents")) {
    const session = await auth0.getSession(req);
    if (!session) {
      return NextResponse.redirect(new URL("/auth/login?returnTo=/incidents", req.url));
    }
  }

  return authRes;
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/incidents/:path*",
    "/api/auth/:path*",
  ],
};
