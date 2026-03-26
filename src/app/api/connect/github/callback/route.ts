import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

/**
 * Completes the Connected Accounts flow for GitHub.
 * Called by Auth0 after the user authorizes GitHub.
 */
export async function GET(req: NextRequest) {
  const domain = process.env.AUTH0_DOMAIN || "dev-6oqfklbhdfm5k0vc.us.auth0.com";
  const baseUrl = process.env.AUTH0_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

  const connectCode = req.nextUrl.searchParams.get("connect_code");
  const authSession = req.cookies.get("__ca_session")?.value;

  if (!connectCode || !authSession) {
    return NextResponse.redirect(new URL("/incidents?error=connect_failed", baseUrl));
  }

  // Get My Account API token
  let meToken: string | undefined;
  try {
    const result = await auth0.getAccessToken({
      audience: `https://${domain}/me/`,
    });
    meToken = result?.token;
  } catch {
    try {
      const result = await auth0.getAccessToken();
      meToken = result?.token;
    } catch {
      return NextResponse.redirect(new URL("/incidents?error=no_token", baseUrl));
    }
  }

  if (!meToken) {
    return NextResponse.redirect(new URL("/incidents?error=no_token", baseUrl));
  }

  // Step 3: Complete the connection
  const res = await fetch(`https://${domain}/me/v1/connected-accounts/complete`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${meToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_session: authSession,
      connect_code: connectCode,
      redirect_uri: `${baseUrl}/api/connect/github/callback`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Connected Accounts complete failed:", res.status, err);
    return NextResponse.redirect(new URL("/incidents?error=complete_failed", baseUrl));
  }

  // Success! Token Vault now has the GitHub refresh token
  const response = NextResponse.redirect(new URL("/incidents?connected=github", baseUrl));
  response.cookies.delete("__ca_session");
  response.cookies.delete("__ca_state");
  return response;
}
