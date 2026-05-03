import { AzureOpenAIClient } from '../utils/AzureOpenAIClient';
import {
  RELEVANCE_BATCH_SYSTEM,
  buildRelevanceBatchUserPrompt,
} from '../prompts/pcRelatedWorkRecommendationPrompt';
import type { PCMemberPaper, RelatedWorkRecommendation, RelationshipType } from '../../types/pcRelatedWork';

const BATCH_SIZE = 15;

interface CandidateInput {
  candidateId: string;
  title: string;
  abstract: string | null;
}

interface RawRecommendation {
  candidateId: string;
  relevant: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  relationshipType: RelationshipType;
}

async function judgeOneBatch(
  ourTitle: string,
  ourAbstract: string,
  batch: CandidateInput[]
): Promise<RawRecommendation[]> {
  const responseText = await AzureOpenAIClient.sendPrompt(
    RELEVANCE_BATCH_SYSTEM,
    buildRelevanceBatchUserPrompt(ourTitle, ourAbstract, batch)
  );

  const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return parsed.recommendations ?? [];
}

export class AIRelevanceService {
  static async judgeRelevance(
    ourTitle: string,
    ourAbstract: string,
    candidates: PCMemberPaper[]
  ): Promise<RelatedWorkRecommendation[]> {
    if (candidates.length === 0) return [];

    console.log(`[AIRelevanceService] Judging ${candidates.length} candidates in batches of ${BATCH_SIZE}`);

    // Build candidate input list with stable IDs
    const inputs: (CandidateInput & { paper: PCMemberPaper })[] = candidates.map((p, i) => ({
      candidateId: `candidate_${String(i).padStart(3, '0')}`,
      title: p.title,
      abstract: p.abstract,
      paper: p,
    }));

    const rawResults: RawRecommendation[] = [];

    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE);
      console.log(`[AIRelevanceService] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} candidates`);
      try {
        const batchResults = await judgeOneBatch(
          ourTitle,
          ourAbstract,
          batch.map(b => ({ candidateId: b.candidateId, title: b.title, abstract: b.abstract }))
        );
        rawResults.push(...batchResults);
      } catch (err) {
        console.error(`[AIRelevanceService] Batch failed:`, err);
      }
    }

    // Map results back to full recommendation objects
    const idToInput = new Map(inputs.map(i => [i.candidateId, i]));
    const recommendations: RelatedWorkRecommendation[] = [];

    for (const raw of rawResults) {
      const input = idToInput.get(raw.candidateId);
      if (!input) continue;
      if (!raw.relevant) continue;
      if (raw.confidence === 'low') continue;
      if (raw.relationshipType === 'unrelated') continue;

      recommendations.push({
        pcMemberName: input.paper.pcMemberName,
        paperTitle: input.paper.title,
        paperAbstract: input.paper.abstract,
        year: input.paper.year,
        venue: input.paper.venue,
        doi: input.paper.doi,
        url: input.paper.url,
        relevant: raw.relevant,
        confidence: raw.confidence,
        relationshipType: raw.relationshipType,
        recommendationReason: raw.reason,
      });
    }

    return recommendations;
  }
}
