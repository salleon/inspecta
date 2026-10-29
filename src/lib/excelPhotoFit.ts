// How many photos per line, and how much smaller (≤ 1), so photos of these
// heights (at full width photoW, gap px apart) fit in `room` px: the biggest that fits, never
// wider than two full-size photos.
export function fitPhotos(heights: number[], room: number, photoW: number, gap: number): { perLine: number; scale: number } {
  let best = { perLine: 2, scale: 0 };
  for (let k = 2; k <= Math.max(2, heights.length); k++) {
    const widthScale = Math.min(1, (2 * photoW + gap - (k - 1) * gap) / (k * photoW));
    let total = 0, gaps = 0;
    for (let i = 0; i < heights.length; i += k) {
      total += Math.max(...heights.slice(i, i + k));
      if (i) gaps += gap;
    }
    const scale = Math.min(widthScale, total ? Math.max(0, room - gaps) / total : 1);
    if (scale > best.scale + 1e-9) best = { perLine: k, scale };
  }
  return best;
}
