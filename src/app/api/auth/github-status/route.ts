import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ connected: false, provider: null });
    }

    const sub: string = session.user.sub || "";
    const isGitHub = sub.startsWith("github|");

    return NextResponse.json({
      connected: isGitHub,
      provider: isGitHub ? "github" : sub.split("|")[0],
      nickname: session.user.nickname || session.user.name,
    });
  } catch {
    return NextResponse.json({ connected: false, provider: null });
  }
}
