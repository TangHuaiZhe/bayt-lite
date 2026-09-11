import test from "node:test";
import assert from "node:assert/strict";
import { parsePodcastFeed } from "../lib/rss.js";

test("extracts podcast metadata and playable episodes", () => {
  const result = parsePodcastFeed(`
    <rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Example Show</title>
        <itunes:image href="https://cdn.example/cover.jpg" />
        <item>
          <guid>episode-1</guid>
          <title>First episode</title>
          <description><![CDATA[<p>Hello <b>world</b>.</p>]]></description>
          <itunes:duration>125</itunes:duration>
          <enclosure url="https://cdn.example/episode.mp3" type="audio/mpeg" />
        </item>
        <item><title>Trailer without audio</title></item>
      </channel>
    </rss>`);

  assert.equal(result.title, "Example Show");
  assert.equal(result.artwork, "https://cdn.example/cover.jpg");
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0].audioUrl, "https://cdn.example/episode.mp3");
  assert.equal(result.episodes[0].duration, "125");
  assert.equal(result.episodes[0].description, "Hello world .");
});

test("rejects documents without an RSS channel", () => {
  assert.throws(() => parsePodcastFeed("<html></html>"), /有效的播客 RSS/);
});
