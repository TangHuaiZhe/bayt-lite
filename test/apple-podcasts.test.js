import test from "node:test";
import assert from "node:assert/strict";
import {
  isApplePodcastEpisodeUrl,
  parseApplePodcastPage,
  resolveApplePodcastEpisode
} from "../lib/apple-podcasts.js";

const appleUrl = "https://podcasts.apple.com/cn/podcast/example/id842818711?i=1000788832865";
const page = `<script id="serialized-server-data" type="application/json">${JSON.stringify({
  data: [{ data: { shelves: [{ items: [{
    adamId: "1000788832865",
    title: "How AI Is Rewriting the Power Law of Venture Capital",
    contextAction: { episodeOffer: {
      title: "How AI Is Rewriting the Power Law of Venture Capital",
      streamUrl: "https://cdn.example.com/episode.mp3",
      showOffer: { title: "The a16z Show" },
      artwork: { template: "https://img.example.com/{w}x{h}bb.{f}" }
    } }
  }] }] } }]
})}</script>`;

test("recognizes only Apple Podcasts episode links", () => {
  assert.equal(isApplePodcastEpisodeUrl(appleUrl), true);
  assert.equal(isApplePodcastEpisodeUrl("https://podcasts.apple.com/cn/podcast/example/id842818711"), false);
  assert.equal(isApplePodcastEpisodeUrl("https://example.com/audio.mp3?i=123"), false);
});

test("extracts the real audio and metadata from an Apple Podcasts page", () => {
  assert.deepEqual(parseApplePodcastPage(page, "1000788832865"), {
    audioUrl: "https://cdn.example.com/episode.mp3",
    title: "How AI Is Rewriting the Power Law of Venture Capital",
    podcast: "The a16z Show",
    artwork: "https://img.example.com/600x600bb.jpg"
  });
});

test("resolves an Apple episode URL through its public page", async () => {
  const resolved = await resolveApplePodcastEpisode(appleUrl, async (_url, options) => {
    assert.match(options.headers["User-Agent"], /BaytLite/);
    return new Response(page, { status: 200, headers: { "Content-Type": "text/html" } });
  });
  assert.equal(resolved.audioUrl, "https://cdn.example.com/episode.mp3");
});
