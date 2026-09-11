import test from "node:test";
import assert from "node:assert/strict";
import { findActiveSegment, findWordState } from "../lib/sync.js";

const segments = [
  { start: 0, end: 2 },
  { start: 2.5, end: 5 },
  { start: 5.2, end: 8 }
];

test("finds the segment containing the playback head", () => {
  assert.equal(findActiveSegment(segments, 3), 1);
  assert.equal(findActiveSegment(segments, 7.9), 2);
});

test("uses a small tolerance at segment endings", () => {
  assert.equal(findActiveSegment(segments, 2.1), 0);
});

test("returns no segment before or between captions", () => {
  assert.equal(findActiveSegment(segments, -1), -1);
  assert.equal(findActiveSegment(segments, 2.3), -1);
});

test("tracks the active word and its playback progress", () => {
  const words = [
    { start: 1, end: 2 },
    { start: 2.2, end: 3 }
  ];
  assert.deepEqual(findWordState(words, 0.5), { active: -1, spoken: 0, progress: 0 });
  assert.deepEqual(findWordState(words, 1.5), { active: 0, spoken: 0, progress: 0.5 });
  assert.deepEqual(findWordState(words, 2.1), { active: -1, spoken: 1, progress: 0 });
  assert.deepEqual(findWordState(words, 2.6), { active: 1, spoken: 1, progress: 0.5 });
});
