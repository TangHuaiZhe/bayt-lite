import { mkdir, readdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { getJob, saveJob } from "./storage.js";
import { transcribeAudio } from "./transcription.js";
import { translateSegments } from "./deepseek.js";
import { mergeSegmentsBySentence } from "./segments.js";

const exec = promisify(execFile);

async function setProgress(id, status, progress, message) {
  const job = await getJob(id);
  if (!job) return;
  await saveJob({ ...job, status, progress, message, updatedAt: new Date().toISOString() });
}

async function prepareChunks(job) {
  const chunkDir = path.resolve("data/chunks", job.id);
  await mkdir(chunkDir, { recursive: true });
  const pattern = path.join(chunkDir, "part-%03d.mp3");
  await exec("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", job.localPath,
    "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k",
    "-f", "segment", "-segment_time", "1200", "-reset_timestamps", "1", pattern
  ]);
  return (await readdir(chunkDir)).filter((name) => name.endsWith(".mp3")).sort().map((name) => path.join(chunkDir, name));
}

async function duration(filePath) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath]);
  return Number(stdout.trim());
}

export async function processJob(id) {
  try {
    const job = await getJob(id);
    if (!job) return;
    await setProgress(id, "processing", 8, "正在准备音频");
    const chunks = await prepareChunks(job);
    const segments = [];
    let timeOffset = 0;

    for (let index = 0; index < chunks.length; index += 1) {
      await setProgress(id, "processing", 12 + Math.round((index / chunks.length) * 43), `正在转写第 ${index + 1}/${chunks.length} 段`);
      const current = await transcribeAudio(chunks[index]);
      segments.push(...current.map((segment) => ({
        ...segment,
        id: String(segments.length + Number(segment.id)),
        start: segment.start + timeOffset,
        end: segment.end + timeOffset
      })));
      timeOffset += await duration(chunks[index]);
    }

    const sentenceSegments = mergeSegmentsBySentence(segments);
    await setProgress(id, "processing", 58, "正在翻译字幕");
    const translated = await translateSegments(sentenceSegments, async (done, total) => {
      await setProgress(id, "processing", 58 + Math.round((done / total) * 36), `正在翻译 ${done}/${total} 句`);
    });
    const latest = await getJob(id);
    await saveJob({
      ...latest,
      segments: translated,
      duration: timeOffset,
      status: "ready",
      progress: 100,
      message: "双语字幕已生成",
      updatedAt: new Date().toISOString()
    });
    await rm(path.resolve("data/chunks", id), { recursive: true, force: true });
  } catch (error) {
    await setProgress(id, "failed", 0, error.message || "处理失败");
    await rm(path.resolve("data/chunks", id), { recursive: true, force: true });
  }
}
