import { OpenFgaClient, CredentialsMethod } from "@openfga/sdk";

/**
 * OpenFGA client for real fine-grained authorization.
 * Manages ephemeral per-incident permission tuples.
 */

let _client: OpenFgaClient | null = null;

function getClient(): OpenFgaClient | null {
  if (_client) return _client;

  const storeId = process.env.FGA_STORE_ID;
  const apiUrl = process.env.FGA_API_URL;

  if (!storeId || !apiUrl || storeId === "REPLACE_ME") {
    return null; // FGA not configured — fall back to local tracking
  }

  const clientId = process.env.FGA_CLIENT_ID;
  const clientSecret = process.env.FGA_CLIENT_SECRET;

  _client = new OpenFgaClient({
    apiUrl,
    storeId,
    credentials:
      clientId && clientSecret && clientId !== "REPLACE_ME"
        ? {
            method: CredentialsMethod.ClientCredentials,
            config: {
              apiTokenIssuer: "fga.us.auth0.com",
              apiAudience: "https://api.us1.fga.dev/",
              clientId,
              clientSecret,
            },
          }
        : undefined,
  });

  return _client;
}

/**
 * Write a tuple granting the agent a relation on a service.
 */
export async function writeTuple(
  agent: string,
  relation: string,
  service: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    await client.write({
      writes: [
        {
          user: `agent:${agent}`,
          relation,
          object: `service:${service}`,
        },
      ],
    });
    return true;
  } catch (err) {
    console.error("FGA writeTuple error:", err);
    return false;
  }
}

/**
 * Check if the agent has a specific relation on a service.
 */
export async function checkTuple(
  agent: string,
  relation: string,
  service: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    const result = await client.check({
      user: `agent:${agent}`,
      relation,
      object: `service:${service}`,
    });
    return result.allowed ?? false;
  } catch (err) {
    console.error("FGA checkTuple error:", err);
    return false;
  }
}

/**
 * Delete all tuples for an agent on a service (both reader and writer).
 */
export async function deleteTuples(
  agent: string,
  service: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    await client.write({
      deletes: [
        { user: `agent:${agent}`, relation: "reader", object: `service:${service}` },
        { user: `agent:${agent}`, relation: "writer", object: `service:${service}` },
      ],
    });
    return true;
  } catch (err) {
    // Ignore errors from deleting non-existent tuples
    console.error("FGA deleteTuples error:", err);
    return false;
  }
}

/**
 * Check if FGA is configured and available.
 */
export function isFgaConfigured(): boolean {
  return getClient() !== null;
}
