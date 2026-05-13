import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DevMusicClient } from "../devMusicClient.js";

function asTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function registerGetMetadataTool(
  server: McpServer,
  client: DevMusicClient,
): void {
  server.registerTool(
    "music_get_metadata",
    {
      description: "Fetch normalized track metadata for a source URL through the backend.",
      inputSchema: z.object({
        url: z.string().url(),
      }),
    },
    async ({ url }) => asTextResult(await client.getMetadata(url)),
  );
}
