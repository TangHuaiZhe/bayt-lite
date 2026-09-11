import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTranscript, translateSegments } from "../lib/deepseek.js";

test("translates segments through the DeepSeek Responses endpoint", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.deepseek.com/responses");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "deepseek-v4-flash");
    assert.equal(body.text.format.type, "json_schema");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({ items: [{ id: "0", zh: "你好，世界。" }] })
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await translateSegments([{ id: "0", start: 0, end: 1, en: "Hello world.", zh: "" }]);
    assert.equal(result[0].zh, "你好，世界。");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("summarizes a transcript into an overview and key points", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.text.format.name, "podcast_summary");
    const input = JSON.parse(body.input);
    assert.equal(input.transcript[0].text, "A useful idea.");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({ overview: "这是一段概述。", keyPoints: ["第一个要点"] })
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const summary = await summarizeTranscript({
      title: "Example",
      podcast: "Test Show",
      segments: [{ start: 0, en: "A useful idea." }]
    });
    assert.deepEqual(summary, { overview: "这是一段概述。", keyPoints: ["第一个要点"] });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});
