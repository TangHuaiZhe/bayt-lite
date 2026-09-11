import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dataPath } from "./paths.js";

const jobsPath = dataPath("jobs.json");
let writeQueue = Promise.resolve();

function serializeWrite(operation) {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function ensureStorage() {
  await mkdir(dataPath("uploads"), { recursive: true });
  await mkdir(dataPath("chunks"), { recursive: true });
  try {
    await readFile(jobsPath, "utf8");
  } catch {
    await writeFile(jobsPath, "[]\n");
  }
}

export async function listJobs() {
  const jobs = JSON.parse(await readFile(jobsPath, "utf8"));
  return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getJob(id) {
  return (await listJobs()).find((job) => job.id === id) ?? null;
}

export async function saveJob(job) {
  return serializeWrite(async () => {
    const jobs = await listJobs();
    const index = jobs.findIndex((item) => item.id === job.id);
    if (index === -1) jobs.push(job);
    else jobs[index] = job;
    await writeFile(jobsPath, `${JSON.stringify(jobs, null, 2)}\n`);
    return job;
  });
}

export async function deleteJob(id) {
  return serializeWrite(async () => {
    const jobs = await listJobs();
    const job = jobs.find((item) => item.id === id);
    if (!job || job.demo) return false;
    await writeFile(jobsPath, `${JSON.stringify(jobs.filter((item) => item.id !== id), null, 2)}\n`);
    if (job.localPath) await rm(job.localPath, { force: true });
    await rm(dataPath("chunks", id), { recursive: true, force: true });
    return true;
  });
}
