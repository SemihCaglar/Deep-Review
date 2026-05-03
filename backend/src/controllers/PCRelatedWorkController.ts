import { Response } from 'express';
import { AppDataSource } from '../data-source';
import { Round } from '../entities/Round';
import { PCRelatedWorkRecommendationService } from '../ai_content/services/pcRelatedWorkRecommendationService';
import type { AuthenticatedRequest } from '../types/auth';
import type { RelatedWorkRecommendation } from '../types/pcRelatedWork';

/**
 * Converts recommendation data into a CSV string.
 * @param recommendations - List of related work recommendations.
 * @returns A formatted CSV string.
 */
function toCSV(recommendations: RelatedWorkRecommendation[]): string {
  const headers = ['PC Member', 'Paper Title', 'Year', 'Venue', 'DOI', 'URL', 'Confidence', 'Relationship Type', 'Reason'];
  const escape = (v: string | null | number) => {
    const s = String(v ?? '');
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = recommendations.map(r => [
    escape(r.pcMemberName),
    escape(r.paperTitle),
    escape(r.year),
    escape(r.venue),
    escape(r.doi),
    escape(r.url),
    escape(r.confidence),
    escape(r.relationshipType),
    escape(r.recommendationReason),
  ].join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

export class PCRelatedWorkController {
  /**
   * Retrieves PC related work recommendations for a paper.
   * Can accept a venue URL to fetch committee members or a manual list.
   * Optionally saves the results to a specific round.
   * @param req - The authenticated request object.
   * @param res - The express response object.
   */
  static async getRecommendations(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      const { venueUrl, paperTitle, paperAbstract, roundId, committeeMembers } = req.body;

      if (!paperTitle || typeof paperTitle !== 'string') {
        return res.status(400).json({ message: 'paperTitle is required.' });
      }
      if (!paperAbstract || typeof paperAbstract !== 'string') {
        return res.status(400).json({ message: 'paperAbstract is required.' });
      }

      // Either venueUrl or committeeMembers must be provided
      if (!committeeMembers) {
        if (!venueUrl || typeof venueUrl !== 'string') {
          return res.status(400).json({ message: 'venueUrl or committeeMembers is required.' });
        }
        if (!/^https?:\/\/.+/i.test(venueUrl.trim())) {
          return res.status(400).json({ message: 'venueUrl must be a valid http/https URL.' });
        }
      }

      const source = committeeMembers ? 'manual input' : `venue: ${venueUrl}`;
      console.log(`[PCRelatedWorkController] Request from user ${user.id} - ${source}`);

      const result = await PCRelatedWorkRecommendationService.recommend(
        venueUrl?.trim() || '',
        paperTitle.trim(),
        paperAbstract.trim(),
        committeeMembers
      );

      // Save to database if roundId is provided
      if (roundId && typeof roundId === 'string') {
        try {
          const roundRepo = AppDataSource.getRepository(Round);
          await roundRepo.update({ id: roundId }, { pcRelatedWorkRecommendations: result as any });
          console.log(`[PCRelatedWorkController] ✓ Saved ${result.recommendations.length} recommendations to round ${roundId}`);
        } catch (dbErr) {
          console.warn(`[PCRelatedWorkController] Could not save to database:`, dbErr);
          // Don't fail the response if DB save fails
        }
      } else {
        console.log(`[PCRelatedWorkController] No roundId provided - results will not be saved`);
      }

      if (req.query.format === 'csv') {
        const csv = toCSV(result.recommendations);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="pc-related-work.csv"');
        return res.status(200).send(csv);
      }

      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[PCRelatedWorkController] Error:', err);
      return res.status(500).json({ message: err.message || 'Internal server error.' });
    }
  }
}
