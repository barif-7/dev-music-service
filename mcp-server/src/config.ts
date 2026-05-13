export type DevMusicConfig = {
  baseUrl: string;
};

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function loadConfig(): DevMusicConfig {
  return {
    baseUrl: normalizeBaseUrl(
      process.env.DEV_MUSIC_BASE_URL || "http://127.0.0.1:8000",
    ),
  };
}
