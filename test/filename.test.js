import test from "node:test";
import assert from "node:assert/strict";
import { decodeMultipartFilename } from "../lib/filename.js";

test("restores a UTF-8 Chinese filename decoded as Latin-1", () => {
  const expected = "我们在浩瀚宇宙中有多渺小【TED-Ed】.mp4";
  const mojibake = Buffer.from(expected, "utf8").toString("latin1");
  assert.equal(decodeMultipartFilename(mojibake), expected);
});

test("keeps filenames that are already valid", () => {
  assert.equal(decodeMultipartFilename("episode.mp3"), "episode.mp3");
  assert.equal(decodeMultipartFilename("中文文件.mp3"), "中文文件.mp3");
  assert.equal(decodeMultipartFilename("café.mp3"), "café.mp3");
});
