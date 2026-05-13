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

export function registerGetLyricsTool(
  server: McpServer,
  client: DevMusicClient,
): void {
  server.registerTool(
    "music_get_lyrics",
    {
      description: "Search for a track and fetch lyrics through the backend's lyrics provider when available.",
      inputSchema: z.object({
        query: z.string().min(1),
      }),
    },
    async ({ query }) => asTextResult(await client.getLyrics(query)),
  );
}
