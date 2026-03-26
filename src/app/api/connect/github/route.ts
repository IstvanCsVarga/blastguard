import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function GET() {
  try {
    return await auth0.connectAccount({
      connection: "github",
      returnTo: "/incidents?connected=github",
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({
      error: err.message,
      name: err.constructor?.name || err.name,
      cause: String((err as unknown as Record<string, unknown>).cause || "none"),
    }, { status: 500 });
  }
}
