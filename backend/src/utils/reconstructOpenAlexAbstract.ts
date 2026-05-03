export function reconstructOpenAlexAbstract(invertedIndex: Record<string, number[]> | null | undefined): string {
  if (!invertedIndex) return '';

  let maxPos = -1;
  for (const positions of Object.values(invertedIndex)) {
    for (const p of positions) {
      if (p > maxPos) maxPos = p;
    }
  }

  if (maxPos < 0) return '';

  const words = new Array<string>(maxPos + 1).fill('');
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const p of positions) {
      words[p] = word;
    }
  }

  return words.join(' ').replace(/\s+/g, ' ').trim();
}
