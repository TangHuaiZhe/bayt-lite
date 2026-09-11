import { cp, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const supportDir = path.join(os.homedir(), "Library/Application Support/听译台");
const runtimeDir = path.join(supportDir, ".venv");
const targetData = path.join(supportDir, "data");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} 退出，错误码：${code}`)));
  });
}

await mkdir(supportDir, { recursive: true });

if (!existsSync(path.join(runtimeDir, "bin/python"))) {
  await run("uv", ["venv", "--python", "3.12", runtimeDir]);
  await run("uv", ["pip", "install", "--python", path.join(runtimeDir, "bin/python"), "mlx-whisper==0.4.3"]);
}

const sourceEnv = path.join(root, ".env");
const targetEnv = path.join(supportDir, ".env");
if (existsSync(sourceEnv) && !existsSync(targetEnv)) {
  await cp(sourceEnv, targetEnv);
  await chmod(targetEnv, 0o600);
}

const sourceJobs = path.join(root, "data/jobs.json");
const targetJobs = path.join(targetData, "jobs.json");
let shouldMigrate = !existsSync(targetJobs);
if (!shouldMigrate) {
  const jobs = JSON.parse(await readFile(targetJobs, "utf8"));
  shouldMigrate = jobs.every((job) => job.demo);
}
if (shouldMigrate && existsSync(sourceJobs)) {
  await mkdir(targetData, { recursive: true });
  if (existsSync(path.join(root, "data/uploads"))) await cp(path.join(root, "data/uploads"), path.join(targetData, "uploads"), { recursive: true });
  const jobs = JSON.parse(await readFile(sourceJobs, "utf8"));
  const migrated = jobs.filter((job) => !job.demo).map((job) => ({
    ...job,
    localPath: job.localPath ? path.join(targetData, "uploads", path.basename(job.localPath)) : job.localPath
  }));
  await writeFile(targetJobs, `${JSON.stringify(migrated, null, 2)}\n`);
}

console.log(`桌面运行环境已准备：${supportDir}`);
