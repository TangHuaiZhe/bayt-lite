export function isRetryableJob(job) {
  return Boolean(job && !job.demo && ["failed", "cancelled"].includes(job.status));
}

export function prepareJobForRetry(job) {
  const next = {
    ...job,
    status: job.sourceUrl ? "processing" : "queued",
    progress: 2,
    message: job.sourceUrl ? "正在重新解析节目地址" : "已重新加入处理队列",
    segments: [],
    updatedAt: new Date().toISOString()
  };
  for (const key of ["duration", "summary", "summaryStatus", "summaryError", "summaryUpdatedAt"]) delete next[key];
  return next;
}
