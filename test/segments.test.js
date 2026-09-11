import test from "node:test";
import assert from "node:assert/strict";
import { mergeSegmentsBySentence } from "../lib/segments.js";

test("merges Whisper fragments until an English sentence-ending mark", () => {
  const result = mergeSegmentsBySentence([
    { id: "0", start: 0, end: 13, en: "Scientists pointed the telescope at an area of the sky", zh: "科学家把望远镜对准天空中的一片区域" },
    { id: "1", start: 13, end: 18, en: "near the Big Dipper, away from", zh: "靠近北斗七星，并且避开" },
    { id: "2", start: 18, end: 21, en: "surrounding stars.", zh: "周围恒星。" },
    { id: "3", start: 21, end: 25, en: "What would show up?", zh: "会出现什么？" },
    { id: "4", start: 25, end: 29, en: "An unfinished final fragment", zh: "最后一个未完片段" }
  ]);

  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {
    id: "0",
    start: 0,
    end: 21,
    en: "Scientists pointed the telescope at an area of the sky near the Big Dipper, away from surrounding stars.",
    zh: "科学家把望远镜对准天空中的一片区域靠近北斗七星，并且避开周围恒星。"
  });
  assert.equal(result[1].en, "What would show up?");
  assert.equal(result[2].en, "An unfinished final fragment");
});

test("leaves complete sentences as separate segments", () => {
  const segments = [
    { id: "a", start: 0, end: 2, en: "First sentence.", zh: "第一句。" },
    { id: "b", start: 2, end: 4, en: "Second sentence!", zh: "第二句！" }
  ];
  const result = mergeSegmentsBySentence(segments);
  assert.equal(result.length, 2);
  assert.equal(result[1].start, 2);
});

test("keeps word timestamps while merging fragments into a sentence", () => {
  const result = mergeSegmentsBySentence([
    { id: "0", start: 0, end: 1, en: "Hello", zh: "", words: [{ text: " Hello", start: 0, end: 0.8 }] },
    { id: "1", start: 1, end: 2, en: "world.", zh: "", words: [{ text: " world.", start: 1, end: 1.8 }] }
  ]);

  assert.deepEqual(result[0].words, [
    { text: " Hello", start: 0, end: 0.8 },
    { text: " world.", start: 1, end: 1.8 }
  ]);
});

test("keeps vocabulary hints while merging stored segments", () => {
  const result = mergeSegmentsBySentence([
    { id: "0", start: 0, end: 1, en: "A careful", zh: "一个仔细的", vocabulary: [{ word: "careful", zh: "仔细的", level: "cet4" }] },
    { id: "1", start: 1, end: 2, en: "translation.", zh: "翻译。", vocabulary: [{ word: "translation", zh: "翻译", level: "cet6" }] }
  ]);

  assert.deepEqual(result[0].vocabulary, [
    { word: "careful", zh: "仔细的", level: "cet4" },
    { word: "translation", zh: "翻译", level: "cet6" }
  ]);
});
