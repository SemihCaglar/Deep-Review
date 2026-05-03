import https from 'https';
import { reconstructOpenAlexAbstract } from '../../utils/reconstructOpenAlexAbstract';
import type { PCMemberPaper, ProgramCommitteeMember } from '../../types/pcRelatedWork';

const MAILTO = process.env.OPENALEX_MAILTO || 'pug-contend-simile@duck.com';
const TIMEOUT_MS = 15000;
const MAX_PAPERS_PER_MEMBER = 15;
const MIN_YEAR = new Date().getFullYear() - 10;
const MIN_AUTHOR_CONFIDENCE = 0.35; // Lowered from 0.45 to match more authors (like Python version does)

function addMailto(url: URL): void {
  if (MAILTO) url.searchParams.set('mailto', MAILTO);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  // Token overlap
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

async function fetchJson(urlString: string): Promise<any> {
  console.log(`[fetchJson] Requesting: ${urlString.substring(0, 100)}...`);

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const result = await new Promise<{ data: any; status: number }>((resolve, reject) => {
        const timer = setTimeout(() => {
          console.error(`[fetchJson] Timeout after ${TIMEOUT_MS}ms`);
          reject(new Error('OpenAlex timeout'));
        }, TIMEOUT_MS);

        https.get(urlString, { headers: { 'User-Agent': 'bilsen-pc-recommender/1.0' } }, (res) => {
          clearTimeout(timer);
          console.log(`[fetchJson] Status: ${res.statusCode}`);

          if (res.statusCode === 404 || res.statusCode === 400) {
            console.warn(`[fetchJson] HTTP ${res.statusCode} - No results`);
            res.resume();
            resolve({ data: null, status: res.statusCode });
            return;
          }
          if (res.statusCode === 429) {
            console.warn(`[fetchJson] HTTP 429 - Rate limited`);
            res.resume();
            resolve({ data: null, status: 429 });
            return;
          }
          if (!res.statusCode || res.statusCode >= 500) {
            console.error(`[fetchJson] HTTP ${res.statusCode} - Server error`);
            res.resume();
            reject(new Error(`OpenAlex HTTP ${res.statusCode}`));
            return;
          }

          let body = '';
          res.setEncoding('utf8');
          res.on('data', c => (body += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              console.log(`[fetchJson] ✓ Parsed JSON, results: ${parsed.results?.length ?? 0}`);
              resolve({ data: parsed, status: res.statusCode! });
            } catch (e) {
              console.error(`[fetchJson] Failed to parse JSON:`, e);
              reject(new Error('Invalid JSON from OpenAlex'));
            }
          });
        }).on('error', err => {
          clearTimeout(timer);
          console.error(`[fetchJson] Network error:`, err.message);
          reject(err);
        });
      }).catch(err => {
        console.error(`[fetchJson] Promise error (attempt ${attempt + 1}/4):`, err.message);
        return { data: null, status: -1, error: err };
      }) as any;

      if (result.status === 429) {
        const delay = Math.min(5000 * (attempt + 1), 30000);
        console.warn(`[fetchJson] Rate limited, waiting ${delay / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (result.status === -1) {
        if (attempt < 3) {
          const waitTime = 1500 * (attempt + 1);
          console.warn(`[fetchJson] Retrying in ${waitTime}ms... (attempt ${attempt + 2}/4)`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }
        console.error(`[fetchJson] All retries exhausted`);
        return null;
      }
      return result.data;
    } catch (err) {
      console.error(`[fetchJson] Unexpected error in attempt ${attempt + 1}/4:`, err);
    }
  }
  console.error(`[fetchJson] Failed after all attempts`);
  return null;
}

async function findAuthorId(member: ProgramCommitteeMember): Promise<string | null> {
  console.log(`[findAuthorId] Searching for: ${member.name}${member.affiliation ? ` (${member.affiliation})` : ''}`);

  // Search by name + affiliation if available
  const query = member.affiliation
    ? `${member.name} ${member.affiliation}`
    : member.name;

  const url = new URL('https://api.openalex.org/authors');
  url.searchParams.set('search', query);
  url.searchParams.set('per-page', '10');
  url.searchParams.set('select', 'id,display_name,display_name_alternatives,last_known_institutions,affiliations');
  addMailto(url);

  console.log(`[findAuthorId] Query: "${query}"`);
  const data = await fetchJson(url.toString());

  if (!data?.results?.length) {
    console.warn(`[findAuthorId] ✗ No OpenAlex results for: ${member.name}`);
    return null;
  }

  console.log(`[findAuthorId] Found ${data.results.length} candidates for: ${member.name}`);

  // Score candidates by name similarity
  let best: string | null = null;
  let bestScore = MIN_AUTHOR_CONFIDENCE;
  let bestName = '';

  for (const author of data.results) {
    const names = [
      author.display_name ?? '',
      ...(author.display_name_alternatives ?? []),
    ];

    let nameSim = 0;
    for (const n of names) nameSim = Math.max(nameSim, nameSimilarity(member.name, n));

    let affSim = 0;
    if (member.affiliation) {
      const affTexts: string[] = [];
      for (const inst of author.last_known_institutions ?? []) {
        if (inst?.display_name) affTexts.push(inst.display_name);
      }
      for (const t of affTexts) affSim = Math.max(affSim, nameSimilarity(member.affiliation, t));
    }

    const score = nameSim * 0.7 + affSim * 0.3;
    console.log(`[OpenAlexAuthorPaper]   "${author.display_name}": score=${score.toFixed(2)} (name=${nameSim.toFixed(2)}, aff=${affSim.toFixed(2)})`);

    if (score > bestScore) {
      bestScore = score;
      best = author.id ?? null;
      bestName = author.display_name ?? '';
    }
  }

  if (best) {
    console.log(`[OpenAlexAuthorPaper] ✓ Matched: "${member.name}" -> "${bestName}" (score=${bestScore.toFixed(2)})`);
  } else {
    console.log(`[OpenAlexAuthorPaper] ✗ No match above threshold (${MIN_AUTHOR_CONFIDENCE}) for: ${member.name}`);
  }

  return best;
}

async function fetchPapers(authorId: string, pcMemberName: string): Promise<PCMemberPaper[]> {
  const shortId = authorId.split('/').pop()!;
  console.log(`[fetchPapers] Fetching papers for ${pcMemberName} (ID: ${shortId})...`);

  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter', `author.id:${shortId},from_publication_date:${MIN_YEAR}-01-01,has_abstract:true`);
  url.searchParams.set('sort', 'publication_year:desc');
  url.searchParams.set('per-page', String(MAX_PAPERS_PER_MEMBER));
  url.searchParams.set('select', 'id,title,abstract_inverted_index,publication_year,primary_location,doi');
  addMailto(url);

  const data = await fetchJson(url.toString());
  if (!data?.results) {
    console.warn(`[fetchPapers] No papers found for ${pcMemberName}`);
    return [];
  }

  console.log(`[fetchPapers] Found ${data.results.length} papers for ${pcMemberName}`);

  const papers: PCMemberPaper[] = [];
  for (const work of data.results) {
    const abstract = reconstructOpenAlexAbstract(work.abstract_inverted_index);
    if (!abstract) {
      console.warn(`[fetchPapers]   - Skipping "${work.title}" (no abstract)`);
      continue; // skip papers without abstract
    }

    const venue = work.primary_location?.source?.display_name ?? null;
    const doi = work.doi ? work.doi.replace('https://doi.org/', '') : null;

    papers.push({
      openAlexId: work.id ?? '',
      pcMemberName,
      openAlexAuthorId: authorId,
      title: (work.title ?? '').replace(/\s+/g, ' ').trim(),
      abstract,
      year: work.publication_year ?? null,
      venue,
      doi,
      url: work.id ?? null,
    });
  }

  console.log(`[fetchPapers] ✓ Collected ${papers.length} papers (with abstracts) for ${pcMemberName}`);

  return papers;
}

export class OpenAlexAuthorPaperService {
  static async fetchMemberPapers(
    member: ProgramCommitteeMember
  ): Promise<{ papers: PCMemberPaper[]; matched: boolean }> {
    await new Promise(r => setTimeout(r, 200)); // polite pacing

    const authorId = await findAuthorId(member);
    if (!authorId) {
      return { papers: [], matched: false };
    }

    await new Promise(r => setTimeout(r, 200));
    const papers = await fetchPapers(authorId, member.name);
    return { papers, matched: true };
  }
}
