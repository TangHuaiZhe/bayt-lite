import { readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);

export async function transcribeAudio(filePath) {
  const python = path.resolve(".venv/bin/python");
  const script = path.resolve("scripts/transcribe.py");
  const outputPath = `${filePath}.transcript.json`;
  try {
    await exec(python, [script, filePath, outputPath], {
      env: { ...process.env, WHISPER_MODEL: process.env.WHISPER_MODEL || "mlx-community/whisper-small-mlx" },
      maxBuffer: 10 * 1024 * 1024
    });
    const result = JSON.parse(await readFile(outputPath, "utf8"));
    return (result.segments || []).map((segment, index) => ({
      id: String(index),
      start: Number(segment.start),
      end: Number(segment.end),
      speaker: "Speaker",
      en: String(segment.text || "").trim(),
      zh: ""
    })).filter((segment) => segment.en);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("本机 Whisper 尚未安装，请先运行 npm run setup。");
    throw new Error(`本机转写失败：${error.stderr?.trim() || error.message}`);
  } finally {
    await rm(outputPath, { force: true });
  }
}
