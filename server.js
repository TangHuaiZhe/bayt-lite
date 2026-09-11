import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { readFile, writeFile, stat, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ensureStorage, listJobs, getJob, saveJob, deleteJob } from "./lib/storage.js";
import { parsePodcastFeed } from "./lib/rss.js";
import { processJob } from "./lib/jobs.js";
import { decodeMultipartFilename } from "./lib/filename.js";
import { mergeSegmentsBySentence } from "./lib/segments.js";
import { isApplePodcastEpisodeUrl, resolveApplePodcastEpisode } from "./lib/apple-podcasts.js";
import { processSummary } from "./lib/summary.js";
import { cancelTask, finishTask, startTask } from "./lib/task-control.js";
import { isRetryableJob, prepareJobForRetry } from "./lib/retry.js";
import { dataPath } from "./lib/paths.js";

const root = path.dirname(fileURLToPath(import.meta.url));
await ensureStorage();

const app = express();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const upload = multer({
  dest: dataPath("uploads"),
  limits: { fileSize: 300 * 1024 * 1024 }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(root, "public")));

function publicJob(job) {
  if (!job) return null;
  const { localPath, ...safe } = job;
  return { ...safe, segments: mergeSegmentsBySentence(safe.segments || []), audioUrl: `/api/jobs/${job.id}/audio` };
}

function safeRemoteUrl(input) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅支持 HTTP 或 HTTPS 地址。 ");
  if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) {
    throw new Error("不允许访问本机或局域网地址。 ");
  }
  return url;
}

async function downloadAudio(remoteUrl, destination, signal) {
  const response = await fetch(safeRemoteUrl(remoteUrl), { redirect: "follow", signal });
  if (!response.ok) throw new Error(`下载音频失败：${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("该地址返回的是网页，不是音频直链。请使用 Apple Podcasts 单集链接、RSS 地址或真实音频地址。");
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 300 * 1024 * 1024) throw new Error("音频超过 300 MB 限制。 ");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 300 * 1024 * 1024) throw new Error("音频超过 300 MB 限制。 ");
  await writeFile(destination, bytes, { signal });
}

async function resolveRemoteSource({ audioUrl, title, podcast, artwork }) {
  safeRemoteUrl(audioUrl);
  if (!isApplePodcastEpisodeUrl(audioUrl)) return { audioUrl, title, podcast, artwork };
  const episode = await resolveApplePodcastEpisode(audioUrl);
  safeRemoteUrl(episode.audioUrl);
  return {
    audioUrl: episode.audioUrl,
    title: title?.trim() || episode.title,
    podcast: podcast?.trim() || episode.podcast,
    artwork: artwork || episode.artwork
  };
}

function runJob(job, { remoteUrl, resolveSource = false } = {}) {
  const controller = startTask(job.id);
  void (async () => {
    try {
      let latest = job;
      let downloadUrl = remoteUrl;
      if (resolveSource) {
        const source = await resolveRemoteSource({
          audioUrl: job.sourceUrl,
          title: job.title === "未命名单集" ? "" : job.title,
          podcast: job.podcast === "链接导入" ? "" : job.podcast,
          artwork: job.artwork
        });
        latest = await getJob(job.id);
        if (!latest || controller.signal.aborted) return;
        latest = await saveJob({
          ...latest,
          title: source.title?.trim() || latest.title,
          podcast: source.podcast?.trim() || latest.podcast,
          artwork: source.artwork || latest.artwork,
          progress: 4,
          message: "正在重新下载音频"
        });
        downloadUrl = source.audioUrl;
      }
      if (downloadUrl) await downloadAudio(downloadUrl, latest.localPath, controller.signal);
      await processJob(latest.id, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return;
      const latest = await getJob(job.id);
      if (!controller.signal.aborted && latest) {
        await saveJob({ ...latest, status: "failed", progress: 0, message: error.message, updatedAt: new Date().toISOString() });
      }
    } finally {
      finishTask(job.id, controller);
    }
  })();
}

async function initializeDemo() {
  if (await getJob("demo")) return;
  const demo = JSON.parse(await readFile(path.join(root, "public/demo/demo.json"), "utf8"));
  await saveJob({
    ...demo,
    id: "demo",
    demo: true,
    localPath: path.join(root, "public/demo/demo.mp3"),
    status: "ready",
    progress: 100,
    message: "演示内容",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

await initializeDemo();

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    localWhisperConfigured: existsSync(process.env.BAYT_PYTHON || path.join(root, ".venv/bin/python")),
    ffmpeg: true
  });
});

app.get("/api/jobs", async (_request, response) => {
  response.json((await listJobs()).map(publicJob));
});

app.get("/api/jobs/:id", async (request, response) => {
  const job = await getJob(request.params.id);
  if (!job) return response.status(404).json({ error: "没有找到该任务。" });
  response.json(publicJob(job));
});

app.post("/api/jobs/:id/summary", async (request, response) => {
  const job = await getJob(request.params.id);
  if (!job) return response.status(404).json({ error: "没有找到该任务。" });
  if (job.status !== "ready" || !job.segments?.length) {
    return response.status(409).json({ error: "字幕生成完成后才能生成总结。" });
  }
  if (job.summaryStatus === "processing") return response.status(202).json(publicJob(job));
  if (job.summary && !request.body?.regenerate) return response.json(publicJob(job));

  const pending = await saveJob({ ...job, summaryStatus: "processing", summaryError: "" });
  response.status(202).json(publicJob(pending));
  const controller = startTask(job.id);
  void processSummary(job.id, { signal: controller.signal }).finally(() => finishTask(job.id, controller));
});

app.get("/api/jobs/:id/audio", async (request, response) => {
  const job = await getJob(request.params.id);
  if (!job?.localPath) return response.status(404).end();
  try {
    const fileStat = await stat(job.localPath);
    const range = request.headers.range;
    const mime = job.mimeType || "audio/mpeg";
    if (!range) {
      response.set({ "Content-Type": mime, "Content-Length": fileStat.size, "Accept-Ranges": "bytes" });
      return createReadStream(job.localPath).pipe(response);
    }
    const [startText, endText] = range.replace("bytes=", "").split("-");
    const start = Number(startText);
    const end = endText ? Number(endText) : fileStat.size - 1;
    response.status(206).set({
      "Content-Type": mime,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
      "Accept-Ranges": "bytes"
    });
    createReadStream(job.localPath, { start, end }).pipe(response);
  } catch {
    response.status(404).end();
  }
});

app.post("/api/jobs/upload", upload.single("audio"), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: "请选择音频文件。" });
  const id = crypto.randomUUID();
  const originalName = decodeMultipartFilename(request.file.originalname);
  const extension = path.extname(originalName) || ".audio";
  const localPath = dataPath("uploads", `${id}${extension}`);
  await rename(request.file.path, localPath);
  const now = new Date().toISOString();
  const job = await saveJob({
    id,
    title: request.body.title?.trim() || path.basename(originalName, extension),
    podcast: "本地导入",
    artwork: "",
    localPath,
    mimeType: request.file.mimetype,
    status: "queued",
    progress: 2,
    message: "已加入处理队列",
    segments: [],
    createdAt: now,
    updatedAt: now
  });
  response.status(202).json(publicJob(job));
  runJob(job);
});

app.post("/api/jobs/url", async (request, response) => {
  const { audioUrl, title, podcast, artwork } = request.body;
  if (!audioUrl) return response.status(400).json({ error: "请输入音频地址。" });
  let source;
  try {
    source = await resolveRemoteSource({ audioUrl, title, podcast, artwork });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
  const id = crypto.randomUUID();
  const localPath = dataPath("uploads", `${id}.audio`);
  const now = new Date().toISOString();
  const job = await saveJob({
    id,
    title: source.title?.trim() || "未命名单集",
    podcast: source.podcast?.trim() || "链接导入",
    artwork: source.artwork || "",
    sourceUrl: audioUrl,
    localPath,
    mimeType: "audio/mpeg",
    status: "processing",
    progress: 4,
    message: "正在下载音频",
    segments: [],
    createdAt: now,
    updatedAt: now
  });
  response.status(202).json(publicJob(job));
  runJob(job, { remoteUrl: source.audioUrl });
});

app.get("/api/rss", async (request, response) => {
  try {
    const url = safeRemoteUrl(request.query.url);
    const result = await fetch(url, { redirect: "follow" });
    if (!result.ok) throw new Error(`读取 RSS 失败：${result.status}`);
    response.json(parsePodcastFeed(await result.text()));
  } catch (error) {
    response.status(400).json({ error: error.message || "无法读取 RSS。" });
  }
});

app.delete("/api/jobs/:id", async (request, response) => {
  cancelTask(request.params.id);
  const deleted = await deleteJob(request.params.id);
  if (!deleted) return response.status(404).json({ error: "任务不存在或不能删除。" });
  response.status(204).end();
});

app.post("/api/jobs/:id/cancel", async (request, response) => {
  const job = await getJob(request.params.id);
  if (!job || job.demo) return response.status(404).json({ error: "任务不存在或不能取消。" });
  const processingJob = ["queued", "processing"].includes(job.status);
  const processingSummary = job.summaryStatus === "processing";
  if (!processingJob && !processingSummary) return response.status(409).json({ error: "该任务当前不需要取消。" });

  cancelTask(job.id);
  const updated = processingJob
    ? { ...job, status: "cancelled", progress: 0, message: "处理已取消", updatedAt: new Date().toISOString() }
    : { ...job, summaryStatus: "cancelled", summaryError: "", updatedAt: new Date().toISOString() };
  await saveJob(updated);
  await rm(dataPath("chunks", job.id), { recursive: true, force: true });
  response.json(publicJob(updated));
});

app.post("/api/jobs/:id/retry", async (request, response) => {
  const job = await getJob(request.params.id);
  if (!job) return response.status(404).json({ error: "没有找到该任务。" });
  if (!isRetryableJob(job)) return response.status(409).json({ error: "只有失败或已取消的任务可以重试。" });
  if (!job.sourceUrl && (!job.localPath || !existsSync(job.localPath))) {
    return response.status(409).json({ error: "原始音频已丢失，请重新导入文件。" });
  }

  cancelTask(job.id);
  const pending = await saveJob(prepareJobForRetry(job));
  response.status(202).json(publicJob(pending));
  runJob(pending, { resolveSource: Boolean(pending.sourceUrl) });
});

app.use((error, _request, response, _next) => {
  response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 500).json({
    error: error.code === "LIMIT_FILE_SIZE" ? "音频超过 300 MB 限制。" : "服务暂时无法完成请求。"
  });
});

app.listen(port, host, () => {
  console.log(`听译台已启动：http://${host}:${port}`);
});
