const TITLE_PREFIXES = /^(prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|phd\.?|associate|assistant|emeritus)\s+/gi;

export function normalizePersonName(raw: string): { name: string; affiliation: string | null } {
  let s = raw.trim();

  // Extract parenthetical affiliation: "Jane Smith (MIT)"
  let affiliation: string | null = null;
  const parenMatch = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    s = parenMatch[1].trim();
    affiliation = parenMatch[2].trim() || null;
  }

  // Strip academic titles
  s = s.replace(TITLE_PREFIXES, '').trim();

  // Collapse internal whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return { name: s, affiliation };
}
