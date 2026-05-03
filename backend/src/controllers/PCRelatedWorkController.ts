import { Response } from 'express';
import { PCRelatedWorkRecommendationService } from '../ai_content/services/pcRelatedWorkRecommendationService';
import type { AuthenticatedRequest } from '../types/auth';
import type { RelatedWorkRecommendation } from '../types/pcRelatedWork';

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
  static async getRecommendations(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      const { venueUrl, paperTitle, paperAbstract } = req.body;

      if (!venueUrl || typeof venueUrl !== 'string') {
        return res.status(400).json({ message: 'venueUrl is required.' });
      }
      if (!paperTitle || typeof paperTitle !== 'string') {
        return res.status(400).json({ message: 'paperTitle is required.' });
      }
      if (!paperAbstract || typeof paperAbstract !== 'string') {
        return res.status(400).json({ message: 'paperAbstract is required.' });
      }
      if (!/^https?:\/\/.+/i.test(venueUrl.trim())) {
        return res.status(400).json({ message: 'venueUrl must be a valid http/https URL.' });
      }

      console.log(`[PCRelatedWorkController] Request from user ${user.id}: ${venueUrl}`);

      const result = await PCRelatedWorkRecommendationService.recommend(
        venueUrl.trim(),
        paperTitle.trim(),
        paperAbstract.trim()
      );

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
