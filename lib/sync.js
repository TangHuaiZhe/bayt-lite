export function findActiveSegment(segments, timeSeconds) {
  let low = 0;
  let high = segments.length - 1;
  let candidate = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (segments[middle].start <= timeSeconds) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (candidate === -1) return -1;
  const segment = segments[candidate];
  return timeSeconds <= segment.end + 0.18 ? candidate : -1;
}

export function findWordState(words, timeSeconds) {
  let low = 0;
  let high = words.length - 1;
  let candidate = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (words[middle].start <= timeSeconds) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (candidate < 0) return { active: -1, spoken: 0, progress: 0 };
  const word = words[candidate];
  if (timeSeconds > word.end) return { active: -1, spoken: candidate + 1, progress: 0 };
  const duration = Math.max(word.end - word.start, 0.01);
  return {
    active: candidate,
    spoken: candidate,
    progress: Math.min(1, Math.max(0, (timeSeconds - word.start) / duration))
  };
}
