import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { readFile, writeFile, stat, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ensureStorage, listJobs, getJob, saveJob, deleteJob } from "./lib/storage.js";
import { parsePodcastFeed } from "./lib/rss.js";
import { processJob } from "./lib/jobs.js";
import { decodeMultipartFilename } from "./lib/filename.js";
import { mergeSegmentsBySentence } from "./lib/segments.js";
import { isApplePodcastEpisodeUrl, resolveApplePodcastEpisode } from "./lib/apple-podcasts.js";
import { processSummary } from "./lib/summary.js";

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
await ensureStorage();

const app = express();
const port = Number(process.env.PORT || 4173);
const upload = multer({
  dest: path.join(root, "data/uploads"),
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

async function downloadAudio(remoteUrl, destination) {
  const response = await fetch(safeRemoteUrl(remoteUrl), { redirect: "follow" });
  if (!response.ok) throw new Error(`下载音频失败：${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("该地址返回的是网页，不是音频直链。请使用 Apple Podcasts 单集链接、RSS 地址或真实音频地址。");
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 300 * 1024 * 1024) throw new Error("音频超过 300 MB 限制。 ");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 300 * 1024 * 1024) throw new Error("音频超过 300 MB 限制。 ");
  await writeFile(destination, bytes);
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
    localWhisperConfigured: existsSync(path.join(root, ".venv/bin/python")),
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
  void processSummary(job.id);
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
  const localPath = path.join(root, "data/uploads", `${id}${extension}`);
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
  void processJob(id);
});

app.post("/api/jobs/url", async (request, response) => {
  const { audioUrl, title, podcast, artwork } = request.body;
  if (!audioUrl) return response.status(400).json({ error: "请输入音频地址。" });
  let source = { audioUrl, title, podcast, artwork };
  try {
    safeRemoteUrl(audioUrl);
    if (isApplePodcastEpisodeUrl(audioUrl)) {
      const appleEpisode = await resolveApplePodcastEpisode(audioUrl);
      source = {
        audioUrl: appleEpisode.audioUrl,
        title: title?.trim() || appleEpisode.title,
        podcast: podcast?.trim() || appleEpisode.podcast,
        artwork: artwork || appleEpisode.artwork
      };
      safeRemoteUrl(source.audioUrl);
    }
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
  const id = crypto.randomUUID();
  const localPath = path.join(root, "data/uploads", `${id}.audio`);
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
  void (async () => {
    try {
      await downloadAudio(source.audioUrl, localPath);
      await processJob(id);
    } catch (error) {
      await saveJob({ ...job, status: "failed", progress: 0, message: error.message, updatedAt: new Date().toISOString() });
    }
  })();
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
  const deleted = await deleteJob(request.params.id);
  if (!deleted) return response.status(404).json({ error: "任务不存在或不能删除。" });
  response.status(204).end();
});

app.use((error, _request, response, _next) => {
  response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 500).json({
    error: error.code === "LIMIT_FILE_SIZE" ? "音频超过 300 MB 限制。" : "服务暂时无法完成请求。"
  });
});

app.listen(port, () => {
  console.log(`听译台已启动：http://localhost:${port}`);
});
