import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { Rating } from '../entities/Rating';
import { ReviewerStats } from '../entities/ReviewerStats';
import { User } from '../entities/User';

export class RatingAnalyticsController {
  static async rateReviewer(req: Request, res: Response) {
    try {
      // ASSUMPTION: Currently, there is no auth/JWT system, so userId is passed in the request body. 
      // In the future, this should be replaced by extracting the user ID from the JWT token via middleware (e.g., req.user.id).
      const { assignmentId, qualityScore, quantityScore, timeScore, userId } = req.body;

      if (!assignmentId || qualityScore === undefined || quantityScore === undefined || timeScore === undefined || !userId) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Validate that scores are between 1 and 5
      if (qualityScore < 1 || qualityScore > 5 || quantityScore < 1 || quantityScore > 5 || timeScore < 1 || timeScore > 5) {
        return res.status(400).json({ message: 'Scores must be between 1 and 5' });
      }

      const assignmentRepo = AppDataSource.getRepository(Assignment);
      const ratingRepo = AppDataSource.getRepository(Rating);
      const reviewerStatsRepo = AppDataSource.getRepository(ReviewerStats);
      const userRepo = AppDataSource.getRepository(User);

      // Validate that the review exists and is completed
      const assignment = await assignmentRepo.findOne({
        where: { id: assignmentId },
        relations: ['round', 'round.paper', 'round.paper.authors', 'rating', 'reviewer']
      });

      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }

      if (assignment.status !== AssignmentStatus.Completed) {
        return res.status(400).json({ message: 'Cannot rate an incomplete assignment' });
      }

      // Validate that it belongs to the user's paper
      const isAuthor = assignment.round?.paper?.authors?.some(a => a.id === userId);
      if (!isAuthor) {
        return res.status(403).json({ message: 'Only authors of the paper can submit ratings' });
      }

      // Validate that it has not already been rated
      if (assignment.rating) {
        return res.status(400).json({ message: 'Review has already been rated' });
      }

      const rater = await userRepo.findOne({ where: { id: userId } });
      if (!rater) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Create a Rating record
      const rating = new Rating();
      rating.qualityScore = qualityScore;
      rating.quantityScore = quantityScore;
      rating.timeScore = timeScore;
      rating.assignment = assignment;
      rating.rater = rater;

      await ratingRepo.save(rating);

      // Update the reviewer's cached statistics if ReviewerStats is used
      if (assignment.reviewer) {
        let stats = await reviewerStatsRepo.findOne({
          where: { user: { id: assignment.reviewer.id } },
          relations: ['user']
        });

        if (!stats) {
          stats = new ReviewerStats();
          stats.user = assignment.reviewer;
          stats.totalAssigned = 0;
          stats.totalCompleted = 0;
          stats.totalIncomplete = 0;
          stats.totalDeclined = 0;
        }

        // Fetch all ratings for this reviewer to recalculate averages
        const allRatings = await ratingRepo.createQueryBuilder('rating')
          .innerJoin('rating.assignment', 'assignment')
          .where('assignment.reviewerId = :reviewerId', { reviewerId: assignment.reviewer.id })
          .getMany();

        if (allRatings.length > 0) {
          const sumQuality = allRatings.reduce((sum, r) => sum + r.qualityScore, 0);
          const sumQuantity = allRatings.reduce((sum, r) => sum + r.quantityScore, 0);
          const sumTime = allRatings.reduce((sum, r) => sum + r.timeScore, 0);

          stats.avgQualityScore = sumQuality / allRatings.length;
          stats.avgQuantityScore = sumQuantity / allRatings.length;
          stats.avgTimeScore = sumTime / allRatings.length;
        } else {
          stats.avgQualityScore = null;
          stats.avgQuantityScore = null;
          stats.avgTimeScore = null;
        }

        await reviewerStatsRepo.save(stats);
      }

      return res.status(201).json({ message: 'Rating submitted successfully', rating });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getOverallAnalytics(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getUserAnalytics(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
