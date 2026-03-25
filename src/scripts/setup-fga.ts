import { OpenFgaClient, CredentialsMethod } from "@openfga/sdk";

async function main() {
  const client = new OpenFgaClient({
    apiUrl: process.env.FGA_API_URL!,
    storeId: process.env.FGA_STORE_ID!,
    credentials: {
      method: CredentialsMethod.ClientCredentials,
      config: {
        apiTokenIssuer: "fga.us.auth0.com",
        apiAudience: `${process.env.FGA_API_URL}/`,
        clientId: process.env.FGA_CLIENT_ID!,
        clientSecret: process.env.FGA_CLIENT_SECRET!,
      },
    },
  });

  console.log("Writing FGA authorization model...");

  const model = await client.writeAuthorizationModel({
    schema_version: "1.1",
    type_definitions: [
      {
        type: "user",
        relations: {},
      },
      {
        type: "agent",
        relations: {},
        metadata: undefined,
      },
      {
        type: "service",
        relations: {
          reader: {
            this: {},
          },
          writer: {
            this: {},
          },
        },
        metadata: {
          relations: {
            reader: {
              directly_related_user_types: [
                { type: "agent" },
                { type: "user" },
              ],
            },
            writer: {
              directly_related_user_types: [
                { type: "agent" },
                { type: "user" },
              ],
            },
          },
        },
      },
    ],
  });

  console.log("Authorization model created:", model.authorization_model_id);
  console.log("\nModel types: user, agent, service");
  console.log("Relations: service#reader, service#writer");
  console.log("\nDone! FGA is ready for BlastGuard.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
