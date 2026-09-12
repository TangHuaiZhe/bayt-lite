export function isRetryableJob(job) {
  return Boolean(job && !job.demo && ["failed", "cancelled"].includes(job.status));
}

export function prepareJobForRetry(job) {
  const resumesLocalChunks = !job.sourceUrl && Number(job.completedChunks) > 0;
  const next = {
    ...job,
    status: job.sourceUrl ? "processing" : "queued",
    progress: 2,
    message: job.sourceUrl
      ? "正在重新解析节目地址"
      : resumesLocalChunks ? `将从第 ${job.completedChunks + 1} 份继续处理` : "已重新加入处理队列",
    segments: resumesLocalChunks ? job.segments || [] : [],
    updatedAt: new Date().toISOString()
  };
  for (const key of ["summary", "summaryStatus", "summaryError", "summaryUpdatedAt"]) delete next[key];
  if (!resumesLocalChunks) {
    for (const key of ["duration", "completedChunks", "pendingSegments"]) delete next[key];
  }
  return next;
}
