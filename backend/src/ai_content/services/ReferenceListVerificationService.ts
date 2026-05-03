import {
  extractPdfText,
  findReferencesSection,
  splitIntoReferences,
  parseReference,
  ExtractionError,
} from '../../utils/referenceExtraction';
import { OpenAlexService, OpenAlexUnavailableError } from './OpenAlexService';
import type { OpenAlexWork } from './OpenAlexService';
import type {
  ParsedReference,
  ReferenceVerificationReport,
  ReferenceStatus,
  VerifiedReference,
} from '../../types/referenceVerification';

function wordOverlapRatio(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

  const wordsA = new Set(normalize(a));
  const wordsB = new Set(normalize(b));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }

  return overlap / Math.max(wordsA.size, wordsB.size);
}

function classifyMatch(
  parsed: ParsedReference,
  found: OpenAlexWork
): { status: ReferenceStatus; note: string | null } {
  // DOI exact match
  if (parsed.doi && found.doi) {
    const parsedNorm = parsed.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//i, '');
    const foundNorm = found.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//i, '');
    if (parsedNorm === foundNorm) {
      return { status: 'verified', note: null };
    }
  }

  const searchText = parsed.title ?? parsed.rawText;
  const similarity = found.title
    ? wordOverlapRatio(searchText, found.title)
    : 0;

  if (similarity >= 0.8) {
    const yearKnownBoth = parsed.year !== null && found.year !== null;
    if (!yearKnownBoth || parsed.year === found.year) {
      return { status: 'verified', note: null };
    }
    return {
      status: 'metadata_mismatch',
      note: `Year in paper: ${parsed.year}, OpenAlex: ${found.year}`,
    };
  }

  if (similarity >= 0.6) {
    return { status: 'possible_match', note: 'Similar title found; manual check recommended' };
  }

  return { status: 'not_found', note: 'No strong match found in OpenAlex' };
}

function buildGracefulReport(
  issues: string[]
): ReferenceVerificationReport {
  return {
    generatedAt: new Date().toISOString(),
    totalReferences: 0,
    verifiedCount: 0,
    possibleMatchCount: 0,
    notFoundCount: 0,
    metadataMismatchCount: 0,
    parseFailedCount: 0,
    references: [],
    issues,
  };
}

function buildReport(
  refs: VerifiedReference[],
  issues: string[]
): ReferenceVerificationReport {
  return {
    generatedAt: new Date().toISOString(),
    totalReferences: refs.length,
    verifiedCount: refs.filter((r) => r.status === 'verified').length,
    possibleMatchCount: refs.filter((r) => r.status === 'possible_match').length,
    notFoundCount: refs.filter((r) => r.status === 'not_found').length,
    metadataMismatchCount: refs.filter((r) => r.status === 'metadata_mismatch').length,
    parseFailedCount: refs.filter((r) => r.status === 'parse_failed').length,
    references: refs,
    issues,
  };
}

export class ReferenceListVerificationService {
  static async verify(pdfBuffer: Buffer): Promise<ReferenceVerificationReport> {
    console.log('[ReferenceListVerification] Starting verification pipeline');
    console.log(`[ReferenceListVerification] PDF buffer size: ${pdfBuffer.length} bytes`);

    const issues: string[] = [];

    // Step 1: Extract text
    let fullText: string;
    try {
      console.log('[ReferenceListVerification] Step 1: Extracting PDF text...');
      fullText = await extractPdfText(pdfBuffer);
      console.log(`[ReferenceListVerification] ✓ Extracted ${fullText.length} characters`);
    } catch (err) {
      if (err instanceof ExtractionError) {
        console.error(`[ReferenceListVerification] ✗ PDF extraction failed: ${err.message}`);
        issues.push(`PDF extraction failed: ${err.message}`);
        return buildGracefulReport(issues);
      }
      throw err;
    }

    // Step 2: Find references section
    console.log('[ReferenceListVerification] Step 2: Finding References section...');
    const referencesBlock = findReferencesSection(fullText);
    if (!referencesBlock) {
      console.warn('[ReferenceListVerification] ✗ References section not found');
      issues.push('References section could not be found in the PDF.');
      return buildGracefulReport(issues);
    }
    console.log(`[ReferenceListVerification] ✓ Found References section (${referencesBlock.length} chars)`);

    // Step 3: Split into individual entries
    console.log('[ReferenceListVerification] Step 3: Splitting references into entries...');
    const rawEntries = splitIntoReferences(referencesBlock);
    if (rawEntries.length === 0) {
      console.warn('[ReferenceListVerification] ✗ Could not split references');
      issues.push('References section was found, but could not be split into individual entries.');
      return buildGracefulReport(issues);
    }
    console.log(`[ReferenceListVerification] ✓ Split into ${rawEntries.length} entries`);

    // Step 4: Parse and verify each reference
    console.log('[ReferenceListVerification] Step 4: Verifying each reference against OpenAlex...');
    const results: VerifiedReference[] = [];
    let openAlexDown = false;

    for (let i = 0; i < rawEntries.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 300));
      const parsed = parseReference(rawEntries[i], i);

      if (!parsed.doi && !parsed.title && parsed.rawText.trim().length < 20) {
        results.push({
          index: i,
          rawText: parsed.rawText,
          parsedDoi: null,
          parsedYear: null,
          parsedTitle: null,
          status: 'parse_failed',
          openAlexTitle: null,
          openAlexDoi: null,
          openAlexYear: null,
          note: 'Reference too short to search',
        });
        continue;
      }

      if (openAlexDown) {
        results.push({
          index: i,
          rawText: parsed.rawText,
          parsedDoi: parsed.doi,
          parsedYear: parsed.year,
          parsedTitle: parsed.title,
          status: 'not_found',
          openAlexTitle: null,
          openAlexDoi: null,
          openAlexYear: null,
          note: 'OpenAlex unavailable',
        });
        continue;
      }

      try {
        let found: OpenAlexWork | null = null;

        if (parsed.doi) {
          found = await OpenAlexService.lookupByDoi(parsed.doi);
        }

        if (!found) {
          const query = parsed.title ?? parsed.rawText.slice(0, 250);
          found = await OpenAlexService.lookupByTitle(query);
        }

        if (!found) {
          results.push({
            index: i,
            rawText: parsed.rawText,
            parsedDoi: parsed.doi,
            parsedYear: parsed.year,
            parsedTitle: parsed.title,
            status: 'not_found',
            openAlexTitle: null,
            openAlexDoi: null,
            openAlexYear: null,
            note: 'No match found in OpenAlex',
          });
        } else {
          const { status, note } = classifyMatch(parsed, found);
          results.push({
            index: i,
            rawText: parsed.rawText,
            parsedDoi: parsed.doi,
            parsedYear: parsed.year,
            parsedTitle: parsed.title,
            status,
            openAlexTitle: found.title,
            openAlexDoi: found.doi,
            openAlexYear: found.year,
            note,
          });
        }
      } catch (err) {
        if (err instanceof OpenAlexUnavailableError) {
          openAlexDown = true;
          console.warn(`[ReferenceListVerification] OpenAlex unavailable at ref ${i}. Marking remaining as not_found.`);
          issues.push('OpenAlex API became unavailable during verification. Remaining references marked as not verified.');
          results.push({
            index: i,
            rawText: parsed.rawText,
            parsedDoi: parsed.doi,
            parsedYear: parsed.year,
            parsedTitle: parsed.title,
            status: 'not_found',
            openAlexTitle: null,
            openAlexDoi: null,
            openAlexYear: null,
            note: 'OpenAlex unavailable',
          });
        } else {
          results.push({
            index: i,
            rawText: parsed.rawText,
            parsedDoi: parsed.doi,
            parsedYear: parsed.year,
            parsedTitle: parsed.title,
            status: 'not_found',
            openAlexTitle: null,
            openAlexDoi: null,
            openAlexYear: null,
            note: 'Lookup error',
          });
        }
      }
    }

    const report = buildReport(results, issues);
    console.log(`[ReferenceListVerification] ✓ Complete. Summary: verified=${report.verifiedCount}, possible=${report.possibleMatchCount}, not_found=${report.notFoundCount}, mismatch=${report.metadataMismatchCount}, parse_failed=${report.parseFailedCount}`);
    if (report.issues.length > 0) {
      console.warn(`[ReferenceListVerification] Issues: ${report.issues.join('; ')}`);
    }

    return report;
  }
}
