import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Round, RoundStatus } from '../entities/Round';
import { Paper } from '../entities/Paper';
import { User, UserRole } from '../entities/User';

export class RoundController {
  static async createReviewRound(req: Request, res: Response) {
    try {
      const { paperId, deadline, coordinatorId } = req.body;
      if (!paperId || !deadline || !coordinatorId) {
        return res.status(400).json({ message: 'Missing paperId, deadline, or coordinatorId' });
      }
      if (isNaN(new Date(deadline).getTime())) {
        return res.status(400).json({ message: 'Invalid deadline format' });
      }

      const userRepo = AppDataSource.getRepository<User>('User');
      const coordinator = await userRepo.findOne({ where: { id: coordinatorId } });
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const paperRepo = AppDataSource.getRepository(Paper);
      const roundRepo = AppDataSource.getRepository(Round);

      const paper = await paperRepo.findOne({ where: { id: paperId } });
      if (!paper) {
        return res.status(404).json({ message: 'Paper not found' });
      }

      // Determine round number
      const existingRounds = await roundRepo.find({ where: { paper: { id: paperId } } });
      const roundNumber = existingRounds.length + 1;

      const round = new Round();
      round.paper = paper;
      round.deadline = new Date(deadline);
      round.roundNumber = roundNumber;
      round.status = RoundStatus.Open;

      await roundRepo.save(round);

      return res.status(201).json(round);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async editRoundDeadline(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { deadline, coordinatorId } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'Missing round id' });
      }
      if (!deadline || !coordinatorId) {
        return res.status(400).json({ message: 'Missing new deadline or coordinatorId' });
      }
      if (isNaN(new Date(deadline).getTime())) {
        return res.status(400).json({ message: 'Invalid deadline format' });
      }

      const userRepo = AppDataSource.getRepository<User>('User');
      const coordinator = await userRepo.findOne({ where: { id: coordinatorId } });
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({ where: { id: id as string } });

      if (!round) {
        return res.status(404).json({ message: 'Round not found' });
      }

      round.deadline = new Date(deadline);
      await roundRepo.save(round);

      return res.status(200).json(round);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async suggestReviewers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async addProposeReviewer(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getProposeReviewers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async trackReviewStatus(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async alertOverdueReviews(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async closeRound(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async startNextRound(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async startAIReview(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async addChecklistItem(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async removeChecklistItem(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateChecklistItem(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
