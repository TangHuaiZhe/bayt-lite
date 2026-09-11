import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (["string", "number"].includes(typeof value)) return String(value);
  return value?.["#text"] ?? "";
}

export function parsePodcastFeed(xml) {
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel) throw new Error("没有在该地址找到有效的播客 RSS。 ");

  const episodes = asArray(channel.item).map((item, index) => ({
    id: text(item.guid) || String(index),
    title: text(item.title) || `未命名单集 ${index + 1}`,
    description: text(item.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    audioUrl: item.enclosure?.["@_url"] || "",
    duration: text(item["itunes:duration"]),
    publishedAt: text(item.pubDate)
  })).filter((item) => item.audioUrl);

  return {
    title: text(channel.title) || "未命名播客",
    artwork: channel["itunes:image"]?.["@_href"] || channel.image?.url || "",
    episodes: episodes.slice(0, 50)
  };
}
