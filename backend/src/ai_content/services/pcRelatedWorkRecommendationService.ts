import { PCMemberScraperService } from './pcMemberScraperService';
import { OpenAlexAuthorPaperService } from './openAlexAuthorPaperService';
import { AIRelevanceService } from './aiRelevanceService';
import {
  pcMembersCacheKey,
  authorPapersCacheKey,
  recommendationCacheKey,
} from '../../utils/cacheKey';
import type {
  ProgramCommitteeMember,
  PCMemberPaper,
  RelatedWorkRecommendation,
  PCRelatedWorkResponse,
} from '../../types/pcRelatedWork';

const MAX_TOTAL_CANDIDATES = 400;
const MAX_RECOMMENDATIONS = 500; // Return all relevant recommendations, not just top 10

const RELATIONSHIP_PRIORITY: Record<string, number> = {
  same_problem: 6,
  same_method: 5,
  same_dataset: 4,
  same_domain: 3,
  background: 2,
  weakly_related: 1,
  unrelated: 0,
};

// Numeric scores for confidence (used in ranking calculation)
const CONFIDENCE_SCORE: Record<string, number> = { high: 1.0, medium: 0.6, low: 0.3 };

// In-memory caches
const pcMembersCache = new Map<string, ProgramCommitteeMember[]>();
const authorPapersCache = new Map<string, PCMemberPaper[]>();
const recommendationsCache = new Map<string, PCRelatedWorkResponse>();

function rankRecommendations(recs: RelatedWorkRecommendation[]): RelatedWorkRecommendation[] {
  return [...recs].sort((a, b) => {
    // Calculate composite score for each recommendation
    // confidence (40%) + relationship (50%) + recency (10%)
    const aConfScore = CONFIDENCE_SCORE[a.confidence] ?? 0;
    const bConfScore = CONFIDENCE_SCORE[b.confidence] ?? 0;

    const aRelScore = RELATIONSHIP_PRIORITY[a.relationshipType] ?? 0;
    const bRelScore = RELATIONSHIP_PRIORITY[b.relationshipType] ?? 0;

    const aRecency = Math.max(0, (a.year ?? 2000) - 2010) / 15; // older papers score lower
    const bRecency = Math.max(0, (b.year ?? 2000) - 2010) / 15;

    const aTotal = (aConfScore * 0.4) + (aRelScore / 6 * 0.5) + (aRecency * 0.1);
    const bTotal = (bConfScore * 0.4) + (bRelScore / 6 * 0.5) + (bRecency * 0.1);

    return bTotal - aTotal; // Higher score first
  });
}

export class PCRelatedWorkRecommendationService {
  static async recommend(
    venueUrl: string,
    paperTitle: string,
    paperAbstract: string,
    committeeMembers?: string
  ): Promise<PCRelatedWorkResponse> {
    const recKey = recommendationCacheKey(venueUrl, paperTitle, paperAbstract);
    if (recommendationsCache.has(recKey)) {
      console.log(`[PCRelatedWork] Cache hit for recommendations`);
      return recommendationsCache.get(recKey)!;
    }

    const issues: string[] = [];

    // Step 1: Get PC members (from manual input or scrape from venue URL)
    let members: ProgramCommitteeMember[];

    let pcKey = '';
    if (committeeMembers) {
      // Parse manually entered committee members
      console.log(`[PCRelatedWork] Using manually entered committee members`);
      const names = committeeMembers
        .split(/[\n,]+/)
        .map(n => n.trim())
        .filter(n => n.length > 0);
      members = names.map((name, idx) => ({
        id: `manual-${idx}`,
        name,
        affiliation: null,
        role: null,
        sourceUrl: 'manual-input',
      }));
      console.log(`[PCRelatedWork] Parsed ${members.length} committee members from manual input`);
    } else {
      // Scrape from venue URL
      pcKey = pcMembersCacheKey(venueUrl);
      if (pcMembersCache.has(pcKey)) {
        members = pcMembersCache.get(pcKey)!;
        console.log(`[PCRelatedWork] PC members from cache: ${members.length}`);
      } else {
        const scraped = await PCMemberScraperService.scrape(venueUrl);
        if (scraped.issues.length) issues.push(...scraped.issues);
        members = scraped.members;
        pcMembersCache.set(pcKey, members);
      }
    }

    if (members.length === 0) {
      return {
        venueUrl,
        paperTitle,
        summary: { pcMembersExtracted: 0, pcMembersMatchedInOpenAlex: 0, candidatePapersChecked: 0, recommendationsReturned: 0 },
        recommendations: [],
        issues,
      };
    }

    console.log(`[PCRelatedWork] Processing ${members.length} PC members`);

    // Step 2: Fetch papers for each member (cached by authorId)
    let matchedCount = 0;
    const allPapers: PCMemberPaper[] = [];

    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      console.log(`[PCRelatedWork] [${i + 1}/${members.length}] Fetching papers for: ${member.name}`);

      const paperKey = authorPapersCacheKey(member.id);
      let papers: PCMemberPaper[];

      if (authorPapersCache.has(paperKey)) {
        papers = authorPapersCache.get(paperKey)!;
        console.log(`[PCRelatedWork]   ✓ From cache: ${papers.length} papers`);
      } else {
        console.log(`[PCRelatedWork]   ⏳ Querying OpenAlex...`);
        const result = await OpenAlexAuthorPaperService.fetchMemberPapers(member);
        papers = result.papers;
        if (result.matched) {
          matchedCount++;
          console.log(`[PCRelatedWork]   ✓ Matched: ${papers.length} papers fetched`);
        } else {
          console.log(`[PCRelatedWork]   ✗ Not matched in OpenAlex`);
        }
        authorPapersCache.set(paperKey, papers);
      }

      allPapers.push(...papers);
      console.log(`[PCRelatedWork]   Total candidates so far: ${allPapers.length}`);

      if (allPapers.length >= MAX_TOTAL_CANDIDATES) {
        console.warn(`[PCRelatedWork] Candidate cap (${MAX_TOTAL_CANDIDATES}) reached, stopping early`);
        issues.push(`Candidate limit reached. Only the first ${MAX_TOTAL_CANDIDATES} papers were evaluated.`);
        break;
      }
    }

    if (pcKey && !pcMembersCache.has(pcKey)) pcMembersCache.set(pcKey, members);

    // Recalculate matchedCount from cache hits
    if (matchedCount === 0 && allPapers.length > 0) matchedCount = members.length;

    // Deduplicate by normalized title before sending to GPT
    const seenTitles = new Set<string>();
    const dedupedPapers = allPapers.filter(p => {
      const key = p.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
    const candidates = dedupedPapers.slice(0, MAX_TOTAL_CANDIDATES);
    console.log(`[PCRelatedWork] Total candidates: ${candidates.length}`);

    if (candidates.length === 0) {
      issues.push('Could not retrieve any papers from OpenAlex for the extracted PC members.');
    }

    // Step 3: GPT relevance judgment
    let recommendations: RelatedWorkRecommendation[] = [];
    if (candidates.length > 0) {
      console.log(`[PCRelatedWork] Starting GPT relevance judgment on ${candidates.length} candidates...`);
      const judgmentStart = Date.now();
      const raw = await AIRelevanceService.judgeRelevance(paperTitle, paperAbstract, candidates);
      const judgmentTime = ((Date.now() - judgmentStart) / 1000).toFixed(2);
      console.log(`[PCRelatedWork] GPT judgment complete in ${judgmentTime}s - ${raw.length} relevant papers found`);
      recommendations = rankRecommendations(raw).slice(0, MAX_RECOMMENDATIONS);
      console.log(`[PCRelatedWork] Ranked top ${recommendations.length} recommendations`);
    } else {
      console.log(`[PCRelatedWork] No candidates to judge`);
    }

    const response: PCRelatedWorkResponse = {
      venueUrl,
      paperTitle,
      summary: {
        pcMembersExtracted: members.length,
        pcMembersMatchedInOpenAlex: matchedCount,
        candidatePapersChecked: candidates.length,
        recommendationsReturned: recommendations.length,
      },
      recommendations,
      issues,
    };

    recommendationsCache.set(recKey, response);
    console.log(`[PCRelatedWork] Done. ${recommendations.length} recommendations returned.`);
    return response;
  }
}
