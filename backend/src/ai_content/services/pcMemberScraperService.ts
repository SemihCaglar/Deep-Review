import * as cheerio from 'cheerio';
import { WebsiteScraperService } from './WebsiteScraperService';
import { normalizePersonName } from '../../utils/normalizePersonName';
import type { ProgramCommitteeMember } from '../../types/pcRelatedWork';

const PC_SECTION_PATTERNS = [
  /program\s+committee/i,
  /pc\s+members?/i,
  /technical\s+program\s+committee/i,
  /research\s+track\s+.*committee/i,
  /industry\s+track\s+.*committee/i,
  /reviewers?/i,
  /committee\s+members?/i,
];

const SKIP_SECTION_PATTERNS = [
  /steering\s+committee/i,
  /organizing\s+committee/i,
  /sponsor/i,
  /keynote/i,
  /workshop/i,
  /tutorial/i,
  /panel/i,
];

function isPcSection(text: string): boolean {
  return PC_SECTION_PATTERNS.some(p => p.test(text)) &&
    !SKIP_SECTION_PATTERNS.some(p => p.test(text));
}

function splitNameAffiliation(text: string): { name: string; affiliation: string | null } {
  const commaIdx = text.indexOf(',');
  const dashIdx = text.indexOf(' - ');
  const sep = commaIdx > 0 && (dashIdx < 0 || commaIdx < dashIdx) ? commaIdx : dashIdx > 0 ? dashIdx : -1;

  if (sep > 0) {
    const raw = text.slice(0, sep).trim();
    const aff = text.slice(sep + 1).replace(/^[\s\-,]+/, '').trim() || null;
    const { name } = normalizePersonName(raw);
    return { name, affiliation: aff };
  }

  const { name, affiliation } = normalizePersonName(text);
  return { name, affiliation };
}

function looksLikeName(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (!/\s/.test(t.split(',')[0].split('(')[0].trim())) return false;
  if (/https?:\/\/|@|^\d+$/.test(t)) return false;
  return true;
}

function deduplicateMembers(members: ProgramCommitteeMember[]): ProgramCommitteeMember[] {
  const seen = new Set<string>();
  return members.filter(m => {
    const key = m.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Strategy A: researchr.org / conf.researchr.org profile link pattern
// <a class="navigate" href="/profile/..."><div class="media-body"><h5 class="media-heading">Name<span>Role</span></h5><h5><span class="text-black">Affiliation</span></h5></div></a>
function extractResearchrProfiles($: cheerio.CheerioAPI): ProgramCommitteeMember[] {
  const members: ProgramCommitteeMember[] = [];

  $('a[href*="/profile/"]').each((_: number, el: any) => {
    const body = $(el).find('.media-body');
    if (!body.length) return;

    const headings = body.find('h3.media-heading, h4.media-heading, h5.media-heading, h6.media-heading');
    if (!headings.length) return;

    // Name is the first text node of the first heading (before any <span>/<small>)
    const firstHeading = headings.first();
    // Clone and remove child elements to get only the direct text
    const clone = firstHeading.clone();
    clone.find('span, small').remove();
    const name = clone.text().replace(/\s+/g, ' ').trim();

    if (!name || name.length < 3) return;

    // Affiliation from span.text-black in subsequent headings
    const affEl = body.find('span.text-black').first();
    const affiliation = affEl.length ? affEl.text().trim() || null : null;

    members.push({
      id: '',
      name,
      affiliation,
      role: null,
      sourceUrl: '',
    });
  });

  return members;
}

// Strategy B: Find PC section headings (h1-h3 only), extract lists/tables/paragraphs beneath
function extractFromSections($: cheerio.CheerioAPI): ProgramCommitteeMember[] {
  const members: ProgramCommitteeMember[] = [];
  const rawEntries: string[] = [];

  $('h1, h2, h3').each((_: number, heading: any) => {
    const headingText = $(heading).text().trim();
    if (!isPcSection(headingText)) return;

    const tagLevel = parseInt(heading.tagName.slice(1), 10);
    let node = $(heading).next();
    const sectionEl = $('<div>');

    while (node.length) {
      const tag = (node[0] as any).tagName?.toLowerCase() ?? '';
      const level = parseInt(tag.slice(1), 10);
      if (tag.match(/^h[1-6]$/) && level <= tagLevel) break;
      sectionEl.append(node.clone());
      node = node.next();
    }

    // Lists
    sectionEl.find('li').each((_: number, li: any) => {
      const t = $(li).text().trim();
      if (t) rawEntries.push(t);
    });

    // Table rows
    if (rawEntries.length === 0) {
      sectionEl.find('tr').each((_: number, row: any) => {
        const cells = $(row).find('td');
        if (cells.length > 0) {
          const name = $(cells[0]).text().trim();
          const aff = cells.length > 1 ? $(cells[1]).text().trim() : null;
          if (name) rawEntries.push(aff ? `${name}, ${aff}` : name);
        }
      });
    }
  });

  for (const entry of rawEntries) {
    const clean = entry.replace(/\s+/g, ' ').trim();
    if (!looksLikeName(clean)) continue;
    const { name, affiliation } = splitNameAffiliation(clean);
    if (!name || name.length < 3) continue;
    members.push({ id: '', name, affiliation, role: null, sourceUrl: '' });
  }

  return members;
}

export class PCMemberScraperService {
  static async scrape(venueUrl: string): Promise<{ members: ProgramCommitteeMember[]; issues: string[] }> {
    console.log(`[PCMemberScraper] Scraping: ${venueUrl}`);
    const issues: string[] = [];

    let html: string;
    try {
      html = await WebsiteScraperService.fetchWebsiteHtml(venueUrl);
    } catch (err) {
      const msg = `Failed to fetch venue page: ${(err as Error).message}`;
      console.error(`[PCMemberScraper] ${msg}`);
      return { members: [], issues: [msg] };
    }

    const $ = cheerio.load(html);
    $('script, style, nav, footer').remove();

    // Try strategies in order, use first that yields results
    let raw: ProgramCommitteeMember[] = extractResearchrProfiles($);

    if (raw.length === 0) {
      raw = extractFromSections($);
    }

    if (raw.length === 0) {
      const msg = 'Could not extract PC members. Page structure may be unsupported.';
      console.warn(`[PCMemberScraper] ${msg}`);
      issues.push(msg);
      return { members: [], issues };
    }

    // Assign stable IDs and sourceUrl
    const members: ProgramCommitteeMember[] = raw.map((m, i) => ({
      ...m,
      id: `${m.name.toLowerCase().replace(/\s+/g, '-')}-${i}`,
      sourceUrl: venueUrl,
    }));

    const unique = deduplicateMembers(members);
    console.log(`[PCMemberScraper] Extracted ${unique.length} unique members`);
    return { members: unique, issues };
  }
}
