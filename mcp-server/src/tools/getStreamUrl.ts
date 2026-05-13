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

export function registerGetStreamUrlTool(
  server: McpServer,
  client: DevMusicClient,
): void {
  server.registerTool(
    "music_get_stream_url",
    {
      description: "Return a backend stream URL for a source track URL without downloading the file.",
      inputSchema: z.object({
        url: z.string().url(),
      }),
    },
    async ({ url }) => asTextResult(await client.getStreamUrl(url)),
  );
}
