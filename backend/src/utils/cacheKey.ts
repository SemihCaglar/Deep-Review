import crypto from 'crypto';

export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function pcMembersCacheKey(venueUrl: string): string {
  return `pc:${hashString(venueUrl)}`;
}

export function authorPapersCacheKey(authorId: string): string {
  return `papers:${authorId}`;
}

export function recommendationCacheKey(venueUrl: string, paperTitle: string, paperAbstract: string): string {
  return `rec:${hashString(venueUrl)}:${hashString(paperTitle + paperAbstract)}`;
}
