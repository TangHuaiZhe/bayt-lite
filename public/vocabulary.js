export const VOCABULARY_LEVELS = Object.freeze({
  cet4: 1,
  cet6: 2,
  ielts: 3,
  advanced: 4
});

export const VOCABULARY_LABELS = Object.freeze({
  cet4: "四级",
  cet6: "六级",
  ielts: "雅思",
  advanced: "更高水平"
});

export function normalizeWord(value = "") {
  return String(value).trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").toLowerCase();
}

export function createVocabularyLookup(vocabulary = []) {
  return new Map(vocabulary.map((entry) => [normalizeWord(entry.word), entry]));
}

export function shouldShowVocabulary(entry, selectedLevel) {
  if (!entry || selectedLevel === "off") return false;
  return VOCABULARY_LEVELS[entry.level] >= VOCABULARY_LEVELS[selectedLevel];
}
