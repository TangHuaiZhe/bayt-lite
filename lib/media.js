import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

export const MAX_AUDIO_BYTES = 300 * 1024 * 1024;

export function mediaUploadError(media, size) {
  if (!media.hasAudio) return "这个文件不包含音轨。";
  if (!media.hasVideo && size > MAX_AUDIO_BYTES) return "音频超过 300 MB 限制。";
  return "";
}

export async function probeMedia(filePath, { signal } = {}) {
  const { stdout } = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type",
    "-of", "json",
    filePath
  ], { signal });
  const streams = JSON.parse(stdout).streams || [];
  return {
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
    hasVideo: streams.some((stream) => stream.codec_type === "video")
  };
}

export async function extractAudio(filePath, outputPath, { signal } = {}) {
  try {
    await exec("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", filePath,
      "-map", "0:a:0", "-vn",
      "-c:a", "aac", "-b:a", "96k",
      outputPath
    ], { signal });
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}
