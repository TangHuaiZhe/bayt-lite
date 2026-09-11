export function isApplePodcastEpisodeUrl(input) {
  try {
    const url = new URL(input);
    return url.hostname === "podcasts.apple.com" && /^\d+$/.test(url.searchParams.get("i") || "");
  } catch {
    return false;
  }
}

function findStreamOffer(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.streamUrl === "string" && value.streamUrl) return value;
  for (const child of Object.values(value)) {
    const found = findStreamOffer(child);
    if (found) return found;
  }
  return null;
}

function findEpisode(value, episodeId) {
  if (!value || typeof value !== "object") return null;
  if ([value.adamId, value.id].some((id) => String(id || "") === episodeId)) {
    const offer = findStreamOffer(value);
    if (offer) return { episode: value, offer };
  }
  for (const child of Object.values(value)) {
    const found = findEpisode(child, episodeId);
    if (found) return found;
  }
  return null;
}

function artworkUrl(artwork) {
  return String(artwork?.template || "")
    .replaceAll("{w}", "600")
    .replaceAll("{h}", "600")
    .replaceAll("{c}", "bb")
    .replaceAll("{f}", "jpg");
}

export function parseApplePodcastPage(html, episodeId) {
  const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find((match) => /\bid=["']?serialized-server-data["']?/i.test(match[1]));
  if (!script) throw new Error("Apple Podcasts 页面没有提供可解析的单集数据。");

  let serialized;
  try {
    serialized = JSON.parse(script[2]);
  } catch {
    throw new Error("Apple Podcasts 单集数据格式无法解析。");
  }

  const match = findEpisode(serialized, episodeId);
  if (!match) throw new Error("没有在 Apple Podcasts 页面中找到该单集的音频。");
  return {
    audioUrl: match.offer.streamUrl,
    title: match.episode.title || match.offer.title || "Apple Podcasts 单集",
    podcast: match.offer.showOffer?.title || match.offer.podcastOffer?.title || "Apple Podcasts",
    artwork: artworkUrl(match.offer.artwork || match.episode.artwork)
  };
}

export async function resolveApplePodcastEpisode(input, fetchImpl = fetch) {
  const url = new URL(input);
  const response = await fetchImpl(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BaytLite/0.1)" }
  });
  if (!response.ok) throw new Error(`读取 Apple Podcasts 页面失败：${response.status}`);
  return parseApplePodcastPage(await response.text(), url.searchParams.get("i"));
}
