import test from "node:test";
import assert from "node:assert/strict";
import { isRetryableJob, prepareJobForRetry } from "../lib/retry.js";

test("only failed and cancelled user jobs can retry", () => {
  assert.equal(isRetryableJob({ status: "failed" }), true);
  assert.equal(isRetryableJob({ status: "cancelled" }), true);
  assert.equal(isRetryableJob({ status: "ready" }), false);
  assert.equal(isRetryableJob({ status: "failed", demo: true }), false);
});

test("prepares a local retry and clears stale derived content", () => {
  const retried = prepareJobForRetry({
    id: "local",
    status: "failed",
    segments: [{ en: "stale" }],
    duration: 12,
    summary: { overview: "stale" },
    summaryStatus: "ready"
  });
  assert.equal(retried.status, "queued");
  assert.equal(retried.message, "已重新加入处理队列");
  assert.deepEqual(retried.segments, []);
  assert.equal("duration" in retried, false);
  assert.equal("summary" in retried, false);
  assert.equal("summaryStatus" in retried, false);
});

test("prepares a remote retry for source re-resolution", () => {
  const retried = prepareJobForRetry({
    id: "remote",
    status: "cancelled",
    sourceUrl: "https://example.com/episode",
    completedChunks: 2,
    segments: [{ en: "stale" }]
  });
  assert.equal(retried.status, "processing");
  assert.equal(retried.progress, 2);
  assert.equal(retried.message, "正在重新解析节目地址");
  assert.deepEqual(retried.segments, []);
  assert.equal("completedChunks" in retried, false);
});

test("resumes a local job from its last completed chunk", () => {
  const retried = prepareJobForRetry({
    id: "local-checkpoint",
    status: "failed",
    completedChunks: 2,
    duration: 1200,
    segments: [{ id: "0", en: "Already translated.", zh: "已翻译。" }],
    pendingSegments: [{ en: "An unfinished" }]
  });
  assert.equal(retried.message, "将从第 3 份继续处理");
  assert.equal(retried.completedChunks, 2);
  assert.equal(retried.duration, 1200);
  assert.equal(retried.segments.length, 1);
  assert.equal(retried.pendingSegments.length, 1);
});
