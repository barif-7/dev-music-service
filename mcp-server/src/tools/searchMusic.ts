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

export function registerSearchMusicTool(
  server: McpServer,
  client: DevMusicClient,
): void {
  server.registerTool(
    "music_search",
    {
      description: "Search for music via the local dev-music-service backend.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(25).default(10),
      }),
    },
    async ({ query, limit }) =>
      asTextResult(await client.searchMusic(query, limit)),
  );
}
