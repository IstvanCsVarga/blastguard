import { Auth0AI } from "@auth0/ai-langchain";

/**
 * Auth0 AI SDK instance configured with tenant credentials.
 * Provides Token Vault (credential exchange) and CIBA (async authorization).
 */
export const auth0AI = new Auth0AI({
  auth0: {
    domain: process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL?.replace("https://", "") || "dev-6oqfklbhdfm5k0vc.us.auth0.com",
    clientId: process.env.AUTH0_CLIENT_ID || "",
    clientSecret: process.env.AUTH0_CLIENT_SECRET || "",
  },
});
