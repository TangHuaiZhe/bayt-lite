import test from "node:test";
import assert from "node:assert/strict";
import { findActiveSegment } from "../lib/sync.js";

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
