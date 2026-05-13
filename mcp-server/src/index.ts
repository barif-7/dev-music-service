import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { DevMusicClient } from "./devMusicClient.js";
import { registerGetLyricsTool } from "./tools/getLyrics.js";
import { registerGetMetadataTool } from "./tools/getMetadata.js";
import { registerGetStreamUrlTool } from "./tools/getStreamUrl.js";
import { registerHealthCheckTool } from "./tools/healthCheck.js";
import { registerPlayMusicTool } from "./tools/playMusic.js";
import { registerResumeMusicTool } from "./tools/resumeMusic.js";
import { registerSearchMusicTool } from "./tools/searchMusic.js";
import { registerStopMusicTool } from "./tools/stopMusic.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new DevMusicClient(config.baseUrl);
  const server = new McpServer(
    {
      name: "dev-music-service-mcp",
      version: "0.1.0",
    },
    {
      instructions:
        "Use these tools for search, metadata, lyrics, health checks, stream URL generation, and local terminal playback against the local dev-music-service backend. Use music_play to search and play a track via ffplay, music_stop to stop, and music_resume to resume. Do not assume the backend is running; call music_health_check when needed.",
    },
  );

  registerHealthCheckTool(server, client);
  registerSearchMusicTool(server, client);
  registerGetStreamUrlTool(server, client);
  registerGetMetadataTool(server, client);
  registerGetLyricsTool(server, client);
  registerPlayMusicTool(server, client);
  registerStopMusicTool(server, client);
  registerResumeMusicTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
