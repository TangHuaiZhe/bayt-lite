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
