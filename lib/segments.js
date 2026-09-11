const sentenceEnding = /[.!?]["'”’\])]*$/;

function joinEnglish(left, right) {
  return `${left.trim()} ${right.trim()}`.replace(/\s+([,.;:!?])/g, "$1");
}

export function mergeSegmentsBySentence(segments) {
  const merged = [];
  let current = null;

  for (const segment of segments) {
    if (!current) {
      current = {
        ...segment,
        id: String(merged.length),
        en: segment.en.trim(),
        zh: segment.zh.trim(),
        ...(segment.words ? { words: segment.words.map((word) => ({ ...word })) } : {})
      };
    } else {
      current.end = segment.end;
      current.en = joinEnglish(current.en, segment.en);
      current.zh = `${current.zh}${segment.zh.trim()}`;
      if (segment.words) current.words = [...(current.words || []), ...segment.words.map((word) => ({ ...word }))];
    }

    if (sentenceEnding.test(current.en)) {
      merged.push(current);
      current = null;
    }
  }

  if (current) merged.push(current);
  return merged;
}
