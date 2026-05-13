import test from "node:test";
import assert from "node:assert/strict";

import { DevMusicClient, normalizeSearchResult } from "./devMusicClient.js";

function jsonResponse(
  payload: unknown,
  init: { status?: number; statusText?: string } = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

test("normalizeSearchResult maps backend payload into MCP shape", () => {
  const result = normalizeSearchResult({
    title: "Track title",
    artist: "Artist",
    duration: 215,
    webpage_url: "https://youtube.com/watch?v=123",
    thumbnail: "https://img.example/cover.jpg",
  });

  assert.ok(result);
  assert.equal(result.title, "Track title");
  assert.equal(result.artist, "Artist");
  assert.equal(result.duration, 215);
  assert.equal(result.url, "https://youtube.com/watch?v=123");
  assert.equal(result.source, "youtube");
});

test("buildBackendUrl encodes parameters", () => {
  const client = new DevMusicClient("http://127.0.0.1:8000");
  assert.equal(
    client.buildBackendUrl("/stream", {
      url: "https://youtube.com/watch?v=test value",
    }),
    "http://127.0.0.1:8000/stream?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dtest+value",
  );
});

test("searchMusic returns structured unavailable response when backend is down", async () => {
  const client = new DevMusicClient(
    "http://127.0.0.1:8000",
    async () => {
      throw new Error("connect ECONNREFUSED");
    },
  );

  const response = await client.searchMusic("drake", 10);
  assert.equal(response.ok, false);
  assert.equal(response.error, "BackendUnavailable");
  assert.match(response.message || "", /ECONNREFUSED/);
});

test("searchMusic normalizes results and reports backend limit cap", async () => {
  const client = new DevMusicClient(
    "http://127.0.0.1:8000",
    async () =>
      jsonResponse([
        {
          title: "Track title",
          artist: "Artist",
          duration: 200,
          webpage_url: "https://youtube.com/watch?v=abc",
          thumbnail: "https://img.example/cover.jpg",
        },
      ]),
  );

  const response = await client.searchMusic("drake", 10);
  assert.equal(response.ok, true);
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0]?.url, "https://youtube.com/watch?v=abc");
  assert.match(response.message || "", /caps search results at 5/);
});

test("getMetadata surfaces not implemented responses cleanly", async () => {
  const client = new DevMusicClient(
    "http://127.0.0.1:8000",
    async () => jsonResponse({ detail: "Not Found" }, { status: 404 }),
  );

  const response = await client.getMetadata("https://youtube.com/watch?v=missing");
  assert.equal(response.ok, false);
  assert.equal(response.error, "NotImplemented");
  assert.equal(response.message, "Not Found");
});

test("getStreamUrl returns a backend playback URL without remote calls", async () => {
  const client = new DevMusicClient("http://127.0.0.1:8000");
  const response = await client.getStreamUrl("https://youtube.com/watch?v=abc");

  assert.deepEqual(response, {
    ok: true,
    streamUrl:
      "http://127.0.0.1:8000/stream?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dabc",
    contentType: "audio/mp4",
    sourceUrl: "https://youtube.com/watch?v=abc",
  });
});
