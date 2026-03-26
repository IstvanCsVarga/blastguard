import { Auth0AI } from "@auth0/ai-langchain";

/**
 * Auth0 AI SDK instance configured with M2M (resource server) credentials.
 * Token Vault exchange requires a client that Auth0 recognizes as a resource
 * server — the M2M "BlastGuard API" app, not the Regular Web App used for login.
 */
export const auth0AI = new Auth0AI({
  auth0: {
    domain: process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL?.replace("https://", "") || "dev-6oqfklbhdfm5k0vc.us.auth0.com",
    clientId: process.env.AUTH0_AI_CLIENT_ID || process.env.AUTH0_CLIENT_ID || "",
    clientSecret: process.env.AUTH0_AI_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET || "",
  },
});
