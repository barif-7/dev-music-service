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

export function registerResumeMusicTool(
  server: McpServer,
  client: DevMusicClient,
): void {
  server.registerTool(
    "music_resume",
    {
      description: "Resume the last stopped local track.",
      inputSchema: z.object({}),
    },
    async () => asTextResult(await client.resumeMusic()),
  );
}
