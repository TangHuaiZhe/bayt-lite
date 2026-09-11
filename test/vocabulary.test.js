import test from "node:test";
import assert from "node:assert/strict";
import { createVocabularyLookup, normalizeWord, shouldShowVocabulary } from "../public/vocabulary.js";

test("normalizes Whisper tokens while preserving apostrophes inside words", () => {
  assert.equal(normalizeWord(" innovation,"), "innovation");
  assert.equal(normalizeWord("don't"), "don't");
});

test("finds vocabulary case-insensitively", () => {
  const lookup = createVocabularyLookup([{ word: "Innovation", zh: "创新", level: "cet6" }]);
  assert.equal(lookup.get(normalizeWord(" innovation,")).zh, "创新");
});

test("shows words from the selected difficulty upward", () => {
  const cet6 = { level: "cet6" };
  const advanced = { level: "advanced" };
  assert.equal(shouldShowVocabulary(cet6, "cet4"), true);
  assert.equal(shouldShowVocabulary(cet6, "ielts"), false);
  assert.equal(shouldShowVocabulary(advanced, "ielts"), true);
  assert.equal(shouldShowVocabulary(advanced, "off"), false);
});
