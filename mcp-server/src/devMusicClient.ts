import {
  type BackendHealthResponse,
  type BackendLyricsResponse,
  type BackendMetadataResponse,
  type BackendSearchItem,
  type LocalPlaybackResponse,
  type LyricsResponse,
  type MetadataResponse,
  type MusicSearchResponse,
  type MusicSearchResult,
  type PlaybackActionResponse,
  type StreamUrlResponse,
} from "./types.js";

type FetchLike = typeof fetch;

type RequestResult<T> = {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
  message?: string;
};

function deriveResultId(item: BackendSearchItem): string {
  const candidate =
    item.webpage_url ||
    item.stream_url ||
    item.title ||
    JSON.stringify(item);

  return Buffer.from(candidate).toString("base64url");
}

function joinLyrics(payload: BackendLyricsResponse): string | undefined {
  if (payload.synced_lyrics) {
    return payload.synced_lyrics;
  }

  if (payload.plain_lyrics) {
    return payload.plain_lyrics;
  }

  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return undefined;
  }

  return payload.lines
    .map((line) => line.text?.trim())
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function normalizeSearchResult(
  item: BackendSearchItem,
): MusicSearchResult | null {
  const url = item.webpage_url;
  if (!url) {
    return null;
  }

  return {
    id: deriveResultId(item),
    title: item.title || "Unknown Title",
    artist: item.artist,
    duration: item.duration,
    url,
    thumbnail: item.thumbnail,
    source: item.source || "youtube",
    raw: item,
  };
}

export class DevMusicClient {
  private readonly baseUrl: string;

  private readonly fetchImpl: FetchLike;

  constructor(baseUrl: string, fetchImpl: FetchLike = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async healthCheck(): Promise<{
    ok: boolean;
    baseUrl: string;
    message: string;
    raw?: BackendHealthResponse;
    error?: string;
  }> {
    const result = await this.requestJson<BackendHealthResponse>("/health");
    if (!result.ok || !result.data) {
      return {
        ok: false,
        baseUrl: this.baseUrl,
        error: result.error || "BackendUnavailable",
        message:
          result.message ||
          `Could not reach dev-music-service at ${this.baseUrl}`,
      };
    }

    return {
      ok: true,
      baseUrl: this.baseUrl,
      message: "Backend reachable",
      raw: result.data,
    };
  }

  async searchMusic(
    query: string,
    limit = 10,
  ): Promise<MusicSearchResponse> {
    const sanitizedLimit = Math.max(1, Math.min(limit, 25));
    const backendLimit = Math.min(sanitizedLimit, 5);
    const result = await this.requestJson<BackendSearchItem[]>(
      "/api/search",
      {
        query,
        limit: String(backendLimit),
      },
    );

    if (!result.ok || !Array.isArray(result.data)) {
      return {
        ok: false,
        query,
        results: [],
        error: result.error || "BackendUnavailable",
        message:
          result.message ||
          `Could not reach dev-music-service at ${this.baseUrl}`,
      };
    }

    return {
      ok: true,
      query,
      results: result.data
        .map(normalizeSearchResult)
        .filter((item): item is MusicSearchResult => item !== null),
      message:
        backendLimit < sanitizedLimit
          ? `Backend currently caps search results at ${backendLimit}.`
          : undefined,
    };
  }

  async getStreamUrl(url: string): Promise<StreamUrlResponse> {
    return {
      ok: true,
      streamUrl: this.buildBackendUrl("/stream", { url }),
      contentType: "audio/mp4",
      sourceUrl: url,
    };
  }

  async getMetadata(url: string): Promise<MetadataResponse> {
    const result = await this.requestJson<BackendMetadataResponse>(
      "/api/metadata",
      { url },
    );

    if (!result.ok || !result.data) {
      return {
        ok: false,
        error: result.error || "BackendUnavailable",
        message:
          result.message ||
          `Could not reach dev-music-service at ${this.baseUrl}`,
      };
    }

    return {
      ok: true,
      title: result.data.title,
      artist: result.data.artist,
      duration: result.data.duration,
      thumbnail: result.data.thumbnail,
      sourceUrl: result.data.webpage_url || url,
      source: result.data.source || "youtube",
      raw: result.data,
    };
  }

  async getLyrics(query: string): Promise<LyricsResponse> {
    const search = await this.searchMusic(query, 1);
    if (!search.ok) {
      return {
        ok: false,
        error: search.error,
        message: search.message,
        provider: "none",
        synced: false,
      };
    }

    const first = search.results[0];
    if (!first) {
      return {
        ok: false,
        error: "LyricsUnavailable",
        message: `No search results found for "${query}".`,
        provider: "none",
        synced: false,
      };
    }

    let artist = first.artist;
    let duration =
      typeof first.duration === "number" ? first.duration : undefined;
    let album: string | undefined;

    if (!artist) {
      const metadata = await this.getMetadata(first.url);
      if (metadata.ok && metadata.raw) {
        artist = metadata.artist;
        if (typeof metadata.duration === "number") {
          duration = metadata.duration;
        }
        const raw = metadata.raw as BackendMetadataResponse;
        album = raw.album;
      }
    }

    if (!artist) {
      return {
        ok: false,
        error: "LyricsUnavailable",
        message:
          "Lyrics lookup requires artist metadata, and the backend result did not include it.",
        provider: "none",
        synced: false,
      };
    }

    const result = await this.requestJson<BackendLyricsResponse>(
      "/api/lyrics",
      {
        title: first.title,
        artist,
        album,
        duration: duration ? String(duration) : undefined,
      },
    );

    if (!result.ok || !result.data) {
      return {
        ok: false,
        error: result.error || "LyricsUnavailable",
        message:
          result.message ||
          "Lyrics are not implemented in dev-music-service yet.",
        provider: "none",
        synced: false,
      };
    }

    const lyrics = joinLyrics(result.data);
    if (!lyrics) {
      return {
        ok: false,
        error: "LyricsUnavailable",
        message: "Lyrics provider returned no lyric text for this track.",
        provider: result.data.provider || "lrclib",
        synced: Boolean(result.data.synced),
        raw: result.data,
      };
    }

    return {
      ok: true,
      lyrics,
      synced: Boolean(result.data.synced),
      provider: result.data.provider || "lrclib",
      raw: result.data,
    };
  }

  async playMusic(query: string): Promise<PlaybackActionResponse> {
    const result = await this.requestJson<LocalPlaybackResponse>("/play", { query });
    if (!result.ok || !result.data) {
      return {
        ok: false,
        error: result.error || "BackendUnavailable",
        message: result.message || `Could not reach dev-music-service at ${this.baseUrl}`,
      };
    }
    return {
      ok: true,
      playing: true,
      title: result.data.title,
      pid: result.data.pid,
      message: `Now playing: ${result.data.title}`,
      raw: result.data,
    };
  }

  async stopMusic(): Promise<PlaybackActionResponse> {
    const result = await this.requestJson<LocalPlaybackResponse>("/stop");
    if (!result.ok || !result.data) {
      return {
        ok: false,
        error: result.error || "BackendUnavailable",
        message: result.message || `Could not reach dev-music-service at ${this.baseUrl}`,
      };
    }
    return {
      ok: true,
      playing: false,
      pid: result.data.pid,
      message: result.data.message || "Playback stopped",
      raw: result.data,
    };
  }

  async resumeMusic(): Promise<PlaybackActionResponse> {
    const result = await this.requestJson<LocalPlaybackResponse>("/resume");
    if (!result.ok || !result.data) {
      return {
        ok: false,
        error: result.error || "BackendUnavailable",
        message: result.message || `Could not reach dev-music-service at ${this.baseUrl}`,
      };
    }
    return {
      ok: true,
      playing: true,
      title: result.data.title,
      pid: result.data.pid,
      message: `Resumed: ${result.data.title}`,
      raw: result.data,
    };
  }

  buildBackendUrl(
    path: string,
    params?: Record<string, string | undefined>,
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }

  private async requestJson<T>(
    path: string,
    params?: Record<string, string | undefined>,
  ): Promise<RequestResult<T>> {
    const url = this.buildBackendUrl(path, params);

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: "application/json",
        },
      });

      let payload: unknown = undefined;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }

      if (!response.ok) {
        const detail =
          typeof payload === "object" && payload && "detail" in payload
            ? String((payload as { detail?: unknown }).detail)
            : response.statusText || "Backend request failed";
        return {
          ok: false,
          status: response.status,
          error:
            response.status === 404
              ? "NotImplemented"
              : response.status >= 500
                ? "BackendUnavailable"
                : "BackendError",
          message: detail,
        };
      }

      return {
        ok: true,
        status: response.status,
        data: payload as T,
      };
    } catch (error) {
      return {
        ok: false,
        error: "BackendUnavailable",
        message:
          error instanceof Error
            ? `Could not reach dev-music-service at ${this.baseUrl}: ${error.message}`
            : `Could not reach dev-music-service at ${this.baseUrl}`,
      };
    }
  }
}
