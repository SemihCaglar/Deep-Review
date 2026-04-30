import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { Coordinator } from '../entities/Coordinator';
import { Rating } from '../entities/Rating';
import { User } from '../entities/User';
import { computeLabRankings } from '../services/reviewerStatsService';
import type { AuthenticatedRequest } from '../types/auth';

export class RatingAnalyticsController {
  static async rateReviewer(req: AuthenticatedRequest, res: Response) {
    try {
      const authenticatedUser = req.user;

      if (!authenticatedUser) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const userId = authenticatedUser.id;
      const { assignmentId, qualityScore, quantityScore, timeScore } = req.body;

      if (!assignmentId || qualityScore === undefined || quantityScore === undefined || timeScore === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      if (qualityScore < 1 || qualityScore > 5 || quantityScore < 1 || quantityScore > 5 || timeScore < 1 || timeScore > 5) {
        return res.status(400).json({ message: 'Scores must be between 1 and 5' });
      }

      const assignmentRepo = AppDataSource.getRepository(Assignment);
      const ratingRepo = AppDataSource.getRepository(Rating);

      const assignment = await assignmentRepo.findOne({
        where: { id: assignmentId },
        relations: ['round', 'round.paper', 'round.paper.authors', 'rating', 'reviewer'],
      });

      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }

      if (assignment.status !== AssignmentStatus.Completed) {
        return res.status(400).json({ message: 'Cannot rate an incomplete assignment' });
      }

      const isAuthor = assignment.round?.paper?.authors?.some(a => a.id === userId);
      if (!isAuthor) {
        return res.status(403).json({ message: 'Only authors of the paper can submit ratings' });
      }

      if (assignment.rating) {
        return res.status(400).json({ message: 'Review has already been rated' });
      }

      const rating = new Rating();
      rating.qualityScore = qualityScore;
      rating.quantityScore = quantityScore;
      rating.timeScore = timeScore;
      rating.assignment = assignment;
      rating.rater = authenticatedUser;

      await ratingRepo.save(rating);

      return res.status(201).json({ message: 'Rating submitted successfully', rating });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getOverallAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinatorRepo = AppDataSource.getRepository(Coordinator);
      const coordinator = await coordinatorRepo.findOne({
        where: { id: req.user!.id },
        relations: ['lab'],
      });

      if (!coordinator?.lab) {
        return res.status(404).json({ message: 'No lab associated with this coordinator' });
      }

      const result = await computeLabRankings(coordinator.lab.id);
      return res.json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getUserAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const targetUserId = req.params.id;

      const coordinatorRepo = AppDataSource.getRepository(Coordinator);
      const coordinator = await coordinatorRepo.findOne({
        where: { id: req.user!.id },
        relations: ['lab', 'lab.members'],
      });

      if (!coordinator?.lab) {
        return res.status(404).json({ message: 'No lab associated with this coordinator' });
      }

      const isMember = coordinator.lab.members.some(m => m.id === targetUserId);
      if (!isMember) {
        return res.status(403).json({ message: 'User is not a member of your lab' });
      }

      const { rankings, summary } = await computeLabRankings(coordinator.lab.id);
      const rankedUser = rankings.find(r => r.userId === targetUserId);

      if (!rankedUser) {
        return res.status(404).json({ message: 'User analytics not found' });
      }

      return res.json({ ...rankedUser, totalReviewers: summary.totalReviewers });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}
