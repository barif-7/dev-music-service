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

export function registerPlayMusicTool(
  server: McpServer,
  client: DevMusicClient,
): void {
  server.registerTool(
    "music_play",
    {
      description:
        "Search for a track and play it immediately via the local terminal (ffplay). Stops any currently playing track first.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Song name, artist, or search query"),
      }),
    },
    async ({ query }) => asTextResult(await client.playMusic(query)),
  );
}
