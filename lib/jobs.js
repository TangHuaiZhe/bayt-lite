import { mkdir, readdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { getJob, saveJob } from "./storage.js";
import { transcribeAudio } from "./transcription.js";
import { translateSegments } from "./deepseek.js";
import { hasSentenceEnding, mergeSegmentsBySentence } from "./segments.js";
import { dataPath } from "./paths.js";

const exec = promisify(execFile);

async function setProgress(id, status, progress, message, signal) {
  if (signal?.aborted) return;
  const job = await getJob(id);
  if (signal?.aborted || !job || job.status === "cancelled") return;
  await saveJob({ ...job, status, progress, message, updatedAt: new Date().toISOString() });
}

async function prepareChunks(job, signal) {
  const chunkDir = dataPath("chunks", job.id);
  await mkdir(chunkDir, { recursive: true });
  const pattern = path.join(chunkDir, "part-%03d.mp3");
  await exec("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", job.localPath,
    "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k",
    "-f", "segment", "-segment_time", "600", "-reset_timestamps", "1", pattern
  ], { signal });
  return (await readdir(chunkDir)).filter((name) => name.endsWith(".mp3")).sort().map((name) => path.join(chunkDir, name));
}

async function duration(filePath, signal) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath], { signal });
  return Number(stdout.trim());
}

export async function processJob(id, { signal } = {}) {
  try {
    const job = await getJob(id);
    if (!job) return;
    await setProgress(id, "processing", 8, "正在准备音频", signal);
    const chunks = await prepareChunks(job, signal);
    const completedChunks = Math.min(Number(job.completedChunks) || 0, chunks.length);
    const segments = completedChunks ? [...(job.segments || [])] : [];
    let pendingSegments = completedChunks ? [...(job.pendingSegments || [])] : [];
    let timeOffset = completedChunks ? Number(job.duration) || 0 : 0;

    for (let index = completedChunks; index < chunks.length; index += 1) {
      const chunkProgress = 10 + Math.round((index / chunks.length) * 84);
      await setProgress(id, "processing", chunkProgress, `正在转写第 ${index + 1}/${chunks.length} 份`, signal);
      const current = await transcribeAudio(chunks[index], { signal });
      const adjusted = current.map((segment) => ({
        ...segment,
        start: segment.start + timeOffset,
        end: segment.end + timeOffset,
        ...(segment.words ? { words: segment.words.map((word) => ({
          ...word,
          start: word.start + timeOffset,
          end: word.end + timeOffset
        })) } : {})
      }));
      const chunkDuration = await duration(chunks[index], signal);
      const readyToTranslate = mergeSegmentsBySentence([...pendingSegments, ...adjusted]);
      pendingSegments = [];
      if (index < chunks.length - 1 && readyToTranslate.length && !hasSentenceEnding(readyToTranslate.at(-1).en)) {
        pendingSegments = [readyToTranslate.pop()];
      }
      readyToTranslate.forEach((segment, segmentIndex) => {
        segment.id = String(segments.length + segmentIndex);
      });

      const translated = await translateSegments(readyToTranslate, async (done, total) => {
        const withinChunk = total ? done / total : 1;
        const progress = 10 + Math.round(((index + 0.65 + withinChunk * 0.35) / chunks.length) * 84);
        await setProgress(id, "processing", progress, `正在翻译第 ${index + 1}/${chunks.length} 份（${done}/${total} 句）`, signal);
      }, { signal });
      segments.push(...translated);
      timeOffset += chunkDuration;

      const latest = await getJob(id);
      if (!latest || signal?.aborted || latest.status === "cancelled") return;
      await saveJob({
        ...latest,
        segments,
        pendingSegments,
        completedChunks: index + 1,
        duration: timeOffset,
        status: "processing",
        progress: 10 + Math.round(((index + 1) / chunks.length) * 84),
        message: `已完成 ${index + 1}/${chunks.length} 份，结果已保存`,
        updatedAt: new Date().toISOString()
      });
    }

    const latest = await getJob(id);
    if (!latest || signal?.aborted || latest.status === "cancelled") return;
    const completed = {
      ...latest,
      segments,
      duration: timeOffset,
      status: "ready",
      progress: 100,
      message: "双语字幕已生成",
      updatedAt: new Date().toISOString()
    };
    delete completed.pendingSegments;
    delete completed.completedChunks;
    await saveJob(completed);
  } catch (error) {
    if (!signal?.aborted) await setProgress(id, "failed", 0, error.message || "处理失败", signal);
  } finally {
    await rm(dataPath("chunks", id), { recursive: true, force: true });
  }
}
