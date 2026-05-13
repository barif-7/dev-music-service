import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig, normalizeBaseUrl } from "./config.js";

test("normalizeBaseUrl strips trailing slashes", () => {
  assert.equal(normalizeBaseUrl("http://127.0.0.1:8000///"), "http://127.0.0.1:8000");
});

test("loadConfig uses default base url", () => {
  const previous = process.env.DEV_MUSIC_BASE_URL;
  delete process.env.DEV_MUSIC_BASE_URL;

  try {
    assert.deepEqual(loadConfig(), {
      baseUrl: "http://127.0.0.1:8000",
    });
  } finally {
    if (previous === undefined) {
      delete process.env.DEV_MUSIC_BASE_URL;
    } else {
      process.env.DEV_MUSIC_BASE_URL = previous;
    }
  }
});

test("loadConfig respects DEV_MUSIC_BASE_URL", () => {
  const previous = process.env.DEV_MUSIC_BASE_URL;
  process.env.DEV_MUSIC_BASE_URL = "http://localhost:9000/";

  try {
    assert.deepEqual(loadConfig(), {
      baseUrl: "http://localhost:9000",
    });
  } finally {
    if (previous === undefined) {
      delete process.env.DEV_MUSIC_BASE_URL;
    } else {
      process.env.DEV_MUSIC_BASE_URL = previous;
    }
  }
});
