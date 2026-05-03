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
const MAX_RECOMMENDATIONS = 10;

const RELATIONSHIP_PRIORITY: Record<string, number> = {
  same_problem: 6,
  same_method: 5,
  same_dataset: 4,
  same_domain: 3,
  background: 2,
  weakly_related: 1,
  unrelated: 0,
};

const CONFIDENCE_PRIORITY: Record<string, number> = { high: 3, medium: 2, low: 1 };

// In-memory caches
const pcMembersCache = new Map<string, ProgramCommitteeMember[]>();
const authorPapersCache = new Map<string, PCMemberPaper[]>();
const recommendationsCache = new Map<string, PCRelatedWorkResponse>();

function rankRecommendations(recs: RelatedWorkRecommendation[]): RelatedWorkRecommendation[] {
  return [...recs].sort((a, b) => {
    const confDiff = (CONFIDENCE_PRIORITY[b.confidence] ?? 0) - (CONFIDENCE_PRIORITY[a.confidence] ?? 0);
    if (confDiff !== 0) return confDiff;
    const relDiff = (RELATIONSHIP_PRIORITY[b.relationshipType] ?? 0) - (RELATIONSHIP_PRIORITY[a.relationshipType] ?? 0);
    if (relDiff !== 0) return relDiff;
    return (b.year ?? 0) - (a.year ?? 0);
  });
}

export class PCRelatedWorkRecommendationService {
  static async recommend(
    venueUrl: string,
    paperTitle: string,
    paperAbstract: string
  ): Promise<PCRelatedWorkResponse> {
    const recKey = recommendationCacheKey(venueUrl, paperTitle, paperAbstract);
    if (recommendationsCache.has(recKey)) {
      console.log(`[PCRelatedWork] Cache hit for recommendations`);
      return recommendationsCache.get(recKey)!;
    }

    const issues: string[] = [];

    // Step 1: Get PC members (cached by venueUrl)
    const pcKey = pcMembersCacheKey(venueUrl);
    let members: ProgramCommitteeMember[];
    if (pcMembersCache.has(pcKey)) {
      members = pcMembersCache.get(pcKey)!;
      console.log(`[PCRelatedWork] PC members from cache: ${members.length}`);
    } else {
      const scraped = await PCMemberScraperService.scrape(venueUrl);
      if (scraped.issues.length) issues.push(...scraped.issues);
      members = scraped.members;
      pcMembersCache.set(pcKey, members);
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

    for (const member of members) {
      const paperKey = authorPapersCacheKey(member.id);
      let papers: PCMemberPaper[];

      if (authorPapersCache.has(paperKey)) {
        papers = authorPapersCache.get(paperKey)!;
      } else {
        const result = await OpenAlexAuthorPaperService.fetchMemberPapers(member);
        papers = result.papers;
        if (result.matched) matchedCount++;
        authorPapersCache.set(paperKey, papers);
      }

      allPapers.push(...papers);

      if (allPapers.length >= MAX_TOTAL_CANDIDATES) {
        console.warn(`[PCRelatedWork] Candidate cap (${MAX_TOTAL_CANDIDATES}) reached, stopping early`);
        issues.push(`Candidate limit reached. Only the first ${MAX_TOTAL_CANDIDATES} papers were evaluated.`);
        break;
      }
    }

    if (!pcMembersCache.has(pcKey)) pcMembersCache.set(pcKey, members);

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
      const raw = await AIRelevanceService.judgeRelevance(paperTitle, paperAbstract, candidates);
      recommendations = rankRecommendations(raw).slice(0, MAX_RECOMMENDATIONS);
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
