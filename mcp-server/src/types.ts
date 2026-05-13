export type MusicSearchResult = {
  id: string;
  title: string;
  artist?: string;
  duration?: string | number;
  url: string;
  thumbnail?: string;
  source?: string;
  raw?: unknown;
};

export type MusicSearchResponse = {
  ok: boolean;
  query: string;
  results: MusicSearchResult[];
  error?: string;
  message?: string;
};

export type StreamUrlResponse = {
  ok: boolean;
  streamUrl?: string;
  contentType?: string;
  sourceUrl?: string;
  error?: string;
  message?: string;
};

export type MetadataResponse = {
  ok: boolean;
  title?: string;
  artist?: string;
  duration?: string | number;
  thumbnail?: string;
  sourceUrl?: string;
  source?: string;
  raw?: unknown;
  error?: string;
  message?: string;
};

export type LyricsResponse = {
  ok: boolean;
  lyrics?: string;
  synced?: boolean;
  provider?: string;
  error?: string;
  message?: string;
  raw?: unknown;
};

export type BackendHealthResponse = {
  status?: string;
  mode?: string;
  stream_delivery?: string;
  local_integration?: string;
  spotify_import?: string;
};

export type BackendSearchItem = {
  title?: string;
  webpage_url?: string;
  stream_url?: string;
  duration?: number;
  album?: string;
  artist?: string;
  thumbnail?: string;
  artwork_source?: string;
  artwork_confidence?: string;
  release_year?: number;
  source?: string;
  [key: string]: unknown;
};

export type BackendLyricsResponse = {
  provider?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  instrumental?: boolean;
  synced?: boolean;
  plain_lyrics?: string;
  synced_lyrics?: string;
  lines?: Array<{
    text?: string;
    start_time_ms?: number;
    end_time_ms?: number;
  }>;
  [key: string]: unknown;
};

export type LocalPlaybackResponse = {
  mode?: string;
  title?: string;
  duration?: number;
  webpage_url?: string;
  pid?: number;
  integration?: string;
  playing?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type PlaybackActionResponse = {
  ok: boolean;
  playing?: boolean;
  title?: string;
  pid?: number;
  message?: string;
  error?: string;
  raw?: LocalPlaybackResponse;
};

export type BackendMetadataResponse = {
  title?: string;
  webpage_url?: string;
  stream_url?: string;
  duration?: number;
  album?: string;
  artist?: string;
  thumbnail?: string;
  artwork_source?: string;
  artwork_confidence?: string;
  release_year?: number;
  source?: string;
  [key: string]: unknown;
};
