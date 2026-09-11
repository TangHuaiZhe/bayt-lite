import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { extractAudio, MAX_AUDIO_BYTES, mediaUploadError, probeMedia } from "../lib/media.js";

const exec = promisify(execFile);

test("detects a video stream and extracts a playable audio-only file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bayt-media-test-"));
  const videoPath = path.join(directory, "sample.mp4");
  const audioPath = path.join(directory, "sample.m4a");
  try {
    await exec("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=size=32x32:duration=0.2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2",
      "-shortest", "-c:v", "libx264", "-c:a", "aac", videoPath
    ]);

    assert.deepEqual(await probeMedia(videoPath), { hasAudio: true, hasVideo: true });
    await extractAudio(videoPath, audioPath);
    assert.deepEqual(await probeMedia(audioPath), { hasAudio: true, hasVideo: false });
    assert.ok((await stat(audioPath)).size > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps the native-audio limit at 300 MB", () => {
  assert.equal(MAX_AUDIO_BYTES, 300 * 1024 * 1024);
  assert.equal(mediaUploadError({ hasAudio: true, hasVideo: false }, MAX_AUDIO_BYTES + 1), "音频超过 300 MB 限制。");
  assert.equal(mediaUploadError({ hasAudio: true, hasVideo: true }, MAX_AUDIO_BYTES + 1), "");
});
