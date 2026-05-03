import type { ParsedReference } from '../types/referenceVerification';

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

// Use pdf-parse v2 API with PDFParse class
async function pdfParseWrapper(pdfBuffer: Buffer): Promise<{ text: string; info?: any }> {
  const { PDFParse } = require('pdf-parse');

  // v2 API: PDFParse class with 'data' parameter for buffer
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  await parser.destroy();

  return { text: result.text || '' };
}

export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfData = await pdfParseWrapper(pdfBuffer);
    const text = pdfData.text || '';

    if (!text || text.trim().length === 0) {
      throw new ExtractionError('PDF text extraction returned empty result');
    }

    return text;
  } catch (err: any) {
    throw new ExtractionError(`PDF text extraction failed: ${err.message}`);
  }
}

export function findReferencesSection(text: string): string | null {
  // Find the LAST occurrence of a references heading to avoid matching "references" in body text
  const pattern = /\n[ \t]*(references|bibliography|works cited)[ \t]*\n/gi;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;

  return text.slice(lastMatch.index + lastMatch[0].length);
}

export function splitIntoReferences(block: string): string[] {
  // Strategy 1: bracketed numbers [1], [2] ...
  const bracketMatches = [...block.matchAll(/(?:^|\n)(\[\d+\])/gm)];
  if (bracketMatches.length >= 2) {
    return sliceByMatches(block, bracketMatches);
  }

  // Strategy 2: dot-prefixed numbers 1. 2. 3. ...
  const dotMatches = [...block.matchAll(/(?:^|\n)(\d{1,3}\.)\s+/gm)];
  if (dotMatches.length >= 2) {
    return sliceByMatches(block, dotMatches);
  }

  // Strategy 3: double newline split (fallback for author-year styles)
  const entries = block
    .split(/\n\s*\n/)
    .map((e) => e.replace(/\s+/g, ' ').trim())
    .filter((e) => e.length >= 20);

  return entries;
}

function sliceByMatches(text: string, matches: RegExpMatchArray[]): string[] {
  const entries: string[] = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;

    const entry = text
      .slice(start, end)
      .replace(/\s+/g, ' ')
      .trim();

    if (entry.length >= 20) {
      entries.push(entry);
    }
  }

  return entries;
}

export function parseReference(rawText: string, index: number): ParsedReference {
  return {
    rawText,
    doi: extractDoi(rawText),
    year: extractYear(rawText),
    title: extractTitle(rawText),
  };
}

function extractDoi(text: string): string | null {
  const match = text.match(/10\.\d{4,}\/[^\s,;\])"]+/);
  return match ? match[0] : null;
}

function extractYear(text: string): number | null {
  // Prefer year in parentheses (APA style) or at end before period
  const parenMatch = text.match(/\((\d{4})\)/);
  if (parenMatch) return Number(parenMatch[1]);

  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function extractTitle(text: string): string | null {
  // Remove leading reference number [1] or 1.
  const cleaned = text.replace(/^\s*(\[\d+\]|\d+\.)\s*/, '').trim();

  // Try quoted title
  const quotedMatch = cleaned.match(/[""](.{10,200})[""\."]/);
  if (quotedMatch) return quotedMatch[1].trim();

  // Try ACM-style: after year, before venue keyword
  const acmMatch = cleaned.match(
    /\b(19|20)\d{2}[.)]\s+(.{10,200?}?)\.\s+(In |Proceedings|IEEE|ACM|Journal|arXiv|Transactions|Software|Empirical)/i
  );
  if (acmMatch?.[2]) return acmMatch[2].trim();

  // Fallback: return cleaned text truncated (used as search query)
  return cleaned.length > 20 ? cleaned.slice(0, 250) : null;
}
