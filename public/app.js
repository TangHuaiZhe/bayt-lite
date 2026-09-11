const state = {
  jobs: [],
  selectedId: null,
  selectedJob: null,
  activeSegment: -1,
  follow: true,
  source: "file",
  rssPodcast: null,
  pollTimer: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const audio = $("#audio");
const timeline = $("#timeline");
const transcript = $("#transcript");

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function renderJobs() {
  $("#job-count").textContent = state.jobs.length;
  $("#job-list").innerHTML = state.jobs.map((job) => `
    <button class="job-card ${job.id === state.selectedId ? "active" : ""}" data-job-id="${job.id}">
      <span class="job-art">${job.artwork ? `<img src="${escapeHtml(job.artwork)}" alt="" />` : "听"}</span>
      <span class="job-copy">
        <strong>${escapeHtml(job.title)}</strong>
        <small>${escapeHtml(job.podcast)} · ${job.status === "ready" ? formatTime(job.duration) : escapeHtml(job.message)}</small>
      </span>
      <span class="job-state ${job.status}" aria-label="${escapeHtml(job.status)}"></span>
    </button>
  `).join("");

  $$("[data-job-id]").forEach((button) => {
    button.addEventListener("click", () => selectJob(button.dataset.jobId));
  });
}

async function loadJobs() {
  state.jobs = await request("/api/jobs");
  renderJobs();
  const hasPending = state.jobs.some((job) => ["queued", "processing"].includes(job.status) || job.summaryStatus === "processing");
  if (hasPending && !state.pollTimer) state.pollTimer = window.setInterval(refreshPending, 1800);
  if (!hasPending && state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function refreshPending() {
  await loadJobs();
  if (state.selectedId) {
    const fresh = state.jobs.find((job) => job.id === state.selectedId);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(state.selectedJob)) showJob(fresh, true);
  }
}

async function selectJob(id) {
  state.selectedId = id;
  state.activeSegment = -1;
  renderJobs();
  const job = await request(`/api/jobs/${id}`);
  showJob(job);
}

function showJob(job, preserveTime = false) {
  const previousTime = preserveTime ? audio.currentTime : 0;
  state.selectedJob = job;
  $("#empty-state").hidden = true;
  $("#player-view").hidden = false;
  $("#episode-title").textContent = job.title;
  $("#podcast-name").textContent = job.podcast;
  const isProcessing = ["queued", "processing"].includes(job.status);
  $("#cancel-job").hidden = Boolean(job.demo) || !isProcessing;
  $("#delete-job").hidden = Boolean(job.demo) || isProcessing;
  renderArtwork(job);

  const status = $("#episode-status");
  status.className = `episode-status ${job.status}`;
  status.textContent = job.status === "ready" ? `${job.segments.length} 句双语字幕` : job.message;

  if (job.status === "ready") {
    if (audio.dataset.jobId !== job.id) {
      audio.src = job.audioUrl;
      audio.dataset.jobId = job.id;
      audio.load();
      const saved = Number(localStorage.getItem(`listen-progress:${job.id}`) || 0);
      audio.addEventListener("loadedmetadata", () => { audio.currentTime = preserveTime ? previousTime : saved; }, { once: true });
    }
    $(".timeline-card").hidden = false;
    renderSummary(job);
    renderTranscript(job.segments);
    $("#segment-summary").textContent = `${job.segments.length} 个时间片段 · 点击任意一句即可跳转`;
  } else {
    audio.pause();
    $(".timeline-card").hidden = true;
    $("#summary-panel").hidden = true;
    transcript.innerHTML = `
      <div class="processing-panel">
        <strong>${escapeHtml(job.message)}</strong>
        <div class="progress-track" style="--progress:${job.progress}%"><i></i></div>
      </div>`;
    $("#segment-summary").textContent = job.status === "failed" ? "请检查错误信息后重新导入" : `处理进度 ${job.progress}%`;
  }
}

function renderSummary(job) {
  const panel = $("#summary-panel");
  panel.hidden = false;
  const status = job.summaryStatus || (job.summary ? "ready" : "idle");

  if (status === "processing") {
    panel.innerHTML = `
      <div class="summary-head"><span class="eyebrow">AI 听后札记</span><button class="summary-link" data-summary-cancel>取消总结</button></div>
      <div class="summary-loading"><i></i><i></i><i></i><strong>正在梳理这集播客</strong><span>完成后会自动显示</span></div>`;
    panel.querySelector("[data-summary-cancel]").addEventListener("click", () => cancelSelectedTask("总结已取消"));
    return;
  }

  if (status === "failed") {
    panel.innerHTML = `
      <div class="summary-head"><span class="eyebrow">AI 听后札记</span></div>
      <div class="summary-empty">
        <div><strong>总结生成失败</strong><p>${escapeHtml(job.summaryError || "请稍后重试。")}</p></div>
        <button class="summary-button" data-summary-action="retry">重新生成</button>
      </div>`;
  } else if (job.summary) {
    const paragraphs = String(job.summary.overview).split(/\n+/).filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
    panel.innerHTML = `
      <div class="summary-head">
        <span class="eyebrow">AI 听后札记</span>
        <button class="summary-link" data-summary-action="regenerate">重新生成</button>
      </div>
      <div class="summary-copy">${paragraphs}</div>
      <ol class="summary-points">${job.summary.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ol>`;
  } else {
    panel.innerHTML = `
      <div class="summary-head"><span class="eyebrow">AI 听后札记</span></div>
      <div class="summary-empty">
        <div><strong>先看懂，再细听</strong><p>基于完整逐字稿生成中文概述和关键要点。</p></div>
        <button class="summary-button" data-summary-action="generate">生成 AI 总结</button>
      </div>`;
  }

  panel.querySelector("[data-summary-action]")?.addEventListener("click", generateSummary);
}

async function generateSummary(event) {
  const button = event.currentTarget;
  const regenerate = button.dataset.summaryAction !== "generate";
  button.disabled = true;
  try {
    const job = await request(`/api/jobs/${state.selectedId}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate })
    });
    state.selectedJob = job;
    renderSummary(job);
    await loadJobs();
  } catch (problem) {
    showToast(problem.message);
    button.disabled = false;
  }
}

function renderArtwork(job) {
  const artwork = $("#artwork");
  artwork.innerHTML = job.artwork ? `<img src="${escapeHtml(job.artwork)}" alt="${escapeHtml(job.podcast)}封面" />` : "<span>听</span>";
}

function renderTranscript(segments) {
  transcript.dataset.view = transcript.dataset.view || "both";
  transcript.innerHTML = segments.map((segment, index) => `
    <article class="segment" data-segment-index="${index}" tabindex="0">
      <time>${formatTime(segment.start)}</time>
      <div class="segment-text">
        <p class="en" lang="en">${escapeHtml(segment.en)}</p>
        <p class="zh">${escapeHtml(segment.zh)}</p>
      </div>
    </article>
  `).join("");
  $$("[data-segment-index]").forEach((element) => {
    const seek = () => {
      const segment = state.selectedJob.segments[Number(element.dataset.segmentIndex)];
      audio.currentTime = segment.start;
      audio.play().catch(() => {});
    };
    element.addEventListener("click", seek);
    element.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); seek(); }
    });
  });
}

function findActiveSegment(segments, currentTime) {
  let low = 0;
  let high = segments.length - 1;
  let candidate = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (segments[middle].start <= currentTime) { candidate = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (candidate < 0) return -1;
  return currentTime <= segments[candidate].end + 0.18 ? candidate : -1;
}

function syncTranscript() {
  if (state.selectedJob?.status !== "ready") return;
  const next = findActiveSegment(state.selectedJob.segments, audio.currentTime);
  if (next === state.activeSegment) return;
  transcript.querySelector(".segment.active")?.classList.remove("active");
  state.activeSegment = next;
  if (next >= 0) {
    const element = transcript.querySelector(`[data-segment-index="${next}"]`);
    element?.classList.add("active");
    if (state.follow) element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function updateTimeline() {
  const total = audio.duration || state.selectedJob?.duration || 0;
  const percent = total ? (audio.currentTime / total) * 100 : 0;
  timeline.value = percent;
  $("#current-time").textContent = formatTime(audio.currentTime);
  $("#duration").textContent = formatTime(total);
  $(".tick-track").style.setProperty("--played", `${percent}%`);
  syncTranscript();
}

function openImport() {
  $("#form-error").textContent = "";
  $("#import-dialog").showModal();
}

function setSource(source) {
  state.source = source;
  $$("[data-source]").forEach((button) => button.classList.toggle("active", button.dataset.source === source));
  $$("[data-source-panel]").forEach((panel) => { panel.hidden = panel.dataset.sourcePanel !== source; });
  $("#import-submit").hidden = source === "rss";
}

async function submitImport(event) {
  event.preventDefault();
  const error = $("#form-error");
  error.textContent = "";
  try {
    let job;
    if (state.source === "file") {
      const file = $("#audio-file").files[0];
      if (!file) throw new Error("请先选择一个音频文件。 ");
      const form = new FormData();
      form.append("audio", file);
      job = await request("/api/jobs/upload", { method: "POST", body: form });
    } else if (state.source === "audio") {
      const audioUrl = $("#audio-url").value.trim();
      if (!audioUrl) throw new Error("请输入音频直链。 ");
      job = await request("/api/jobs/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl, title: $("#audio-title").value.trim() })
      });
    } else return;
    $("#import-dialog").close();
    await loadJobs();
    await selectJob(job.id);
    showToast("已加入处理队列");
  } catch (problem) {
    error.textContent = problem.message;
  }
}

async function loadRss() {
  const error = $("#form-error");
  const results = $("#rss-results");
  error.textContent = "";
  results.innerHTML = "正在读取节目…";
  try {
    const url = $("#rss-url").value.trim();
    if (!url) throw new Error("请输入 RSS 地址。 ");
    state.rssPodcast = await request(`/api/rss?url=${encodeURIComponent(url)}`);
    results.innerHTML = state.rssPodcast.episodes.map((episode, index) => `
      <button type="button" class="episode-choice" data-episode-index="${index}">
        <strong>${escapeHtml(episode.title)}</strong>
        <small>${escapeHtml(episode.publishedAt || episode.duration || "可生成双语字幕")}</small>
      </button>
    `).join("") || "该 RSS 没有可处理的音频单集。";
    $$("[data-episode-index]").forEach((button) => button.addEventListener("click", () => importRssEpisode(Number(button.dataset.episodeIndex))));
  } catch (problem) {
    results.innerHTML = "";
    error.textContent = problem.message;
  }
}

async function importRssEpisode(index) {
  const episode = state.rssPodcast.episodes[index];
  const error = $("#form-error");
  try {
    const job = await request("/api/jobs/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioUrl: episode.audioUrl,
        title: episode.title,
        podcast: state.rssPodcast.title,
        artwork: state.rssPodcast.artwork
      })
    });
    $("#import-dialog").close();
    await loadJobs();
    await selectJob(job.id);
    showToast("已开始下载并处理");
  } catch (problem) {
    error.textContent = problem.message;
  }
}

$("#import-open").addEventListener("click", openImport);
$("#demo-open").addEventListener("click", () => selectJob("demo"));
$$('.dialog-close').forEach((button) => button.addEventListener('click', () => $('#import-dialog').close()));
$("#import-form").addEventListener("submit", submitImport);
$("#rss-load").addEventListener("click", loadRss);
$$("[data-source]").forEach((button) => button.addEventListener("click", () => setSource(button.dataset.source)));

$("#play").addEventListener("click", () => audio.paused ? audio.play() : audio.pause());
$("#backward").addEventListener("click", () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
$("#forward").addEventListener("click", () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15); });
$("#speed").addEventListener("change", (event) => { audio.playbackRate = Number(event.target.value); });
$("#follow-toggle").addEventListener("click", (event) => {
  state.follow = !state.follow;
  event.currentTarget.classList.toggle("active", state.follow);
  event.currentTarget.setAttribute("aria-pressed", String(state.follow));
});
timeline.addEventListener("input", () => { if (audio.duration) audio.currentTime = (Number(timeline.value) / 100) * audio.duration; });
audio.addEventListener("timeupdate", updateTimeline);
audio.addEventListener("durationchange", updateTimeline);
audio.addEventListener("play", () => { $("#play span").textContent = "Ⅱ"; $("#play").setAttribute("aria-label", "暂停"); });
audio.addEventListener("pause", () => { $("#play span").textContent = "▶"; $("#play").setAttribute("aria-label", "播放"); });
window.setInterval(() => {
  if (state.selectedId && !audio.paused) localStorage.setItem(`listen-progress:${state.selectedId}`, String(audio.currentTime));
}, 3000);

$$("[data-view]").forEach((button) => button.addEventListener("click", () => {
  $$("[data-view]").forEach((item) => item.classList.toggle("active", item === button));
  transcript.dataset.view = button.dataset.view;
}));

$("#delete-job").addEventListener("click", async () => {
  if (!state.selectedId || state.selectedJob?.demo) return;
  if (!window.confirm("删除这个任务及其本地音频和字幕？")) return;
  try {
    await request(`/api/jobs/${state.selectedId}`, { method: "DELETE" });
    localStorage.removeItem(`listen-progress:${state.selectedId}`);
    state.selectedId = null;
    state.selectedJob = null;
    audio.pause();
    audio.removeAttribute("src");
    $("#player-view").hidden = true;
    $("#empty-state").hidden = false;
    await loadJobs();
    showToast("任务已删除");
  } catch (problem) {
    showToast(problem.message);
  }
});

async function cancelSelectedTask(message = "任务已取消") {
  if (!state.selectedId || state.selectedJob?.demo) return;
  try {
    const job = await request(`/api/jobs/${state.selectedId}/cancel`, { method: "POST" });
    showJob(job, true);
    await loadJobs();
    showToast(message);
  } catch (problem) {
    showToast(problem.message);
  }
}

$("#cancel-job").addEventListener("click", () => cancelSelectedTask());

await loadJobs();
