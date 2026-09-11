import { getJob, saveJob } from "./storage.js";
import { summarizeTranscript } from "./deepseek.js";
import { mergeSegmentsBySentence } from "./segments.js";

export async function processSummary(id) {
  try {
    const job = await getJob(id);
    if (!job || job.status !== "ready") return;
    const summary = await summarizeTranscript({
      title: job.title,
      podcast: job.podcast,
      segments: mergeSegmentsBySentence(job.segments || [])
    });
    const latest = await getJob(id);
    await saveJob({
      ...latest,
      summary,
      summaryStatus: "ready",
      summaryError: "",
      summaryUpdatedAt: new Date().toISOString()
    });
  } catch (error) {
    const job = await getJob(id);
    if (!job) return;
    await saveJob({
      ...job,
      summaryStatus: "failed",
      summaryError: error.message || "总结生成失败"
    });
  }
}
