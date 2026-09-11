import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTranscriptionSegment } from "../lib/transcription.js";

test("normalizes Whisper word timestamps for storage", () => {
  const segment = normalizeTranscriptionSegment({
    start: 1,
    end: 3,
    text: " Hello world.",
    words: [
      { word: " Hello", start: 1, end: 1.7, probability: 0.98 },
      { word: " world.", start: 1.8, end: 3, probability: 0.97 }
    ]
  }, 4);

  assert.deepEqual(segment.words, [
    { text: " Hello", start: 1, end: 1.7 },
    { text: " world.", start: 1.8, end: 3 }
  ]);
  assert.equal(segment.id, "4");
  assert.equal(segment.en, "Hello world.");
});
