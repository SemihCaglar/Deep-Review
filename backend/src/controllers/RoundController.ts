import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Round, RoundStatus } from '../entities/Round';
import { Paper } from '../entities/Paper';
import { User, UserRole } from '../entities/User';
import { AssignmentStatus } from '../entities/Assignment';

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
    try {
      const { id } = req.params;
      const roundRepo = AppDataSource.getRepository(Round);
      
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: [
          'paper', 
          'paper.authors', 
          'paper.labs', 
          'paper.rounds', 
          'paper.rounds.assignments', 
          'paper.rounds.assignments.reviewer'
        ]
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });
      
      const paper = round.paper;
      const paperLabIds = paper.labs?.map(l => l.id) || [];
      const authorIds = paper.authors?.map(a => a.id) || [];

      const userRepo = AppDataSource.getRepository<User>('User');
      const candidates = await userRepo.find({
        relations: ['labs']
      });

      let suggestions = [];

      for (const user of candidates) {
        if (user.role === UserRole.Admin) continue;

        // Enforce Intra-Lab boundaries
        const userLabIds = user.labs?.map(l => l.id) || [];
        const sharesLab = userLabIds.some(lid => paperLabIds.includes(lid));
        if (!sharesLab) continue;

        // Hard COI: Author
        if (authorIds.includes(user.id)) continue;

        // Rule #8: Submitted in previous round
        let hasSubmittedPrior = false;
        let didNotSubmitPrior = false;

        if (paper.rounds) {
          for (const r of paper.rounds) {
            if (r.id === round.id) continue;
            const assignment = r.assignments?.find(a => a.reviewer.id === user.id);
            if (assignment) {
              if (assignment.status === AssignmentStatus.Completed || assignment.submittedAt) {
                hasSubmittedPrior = true;
              } else if (assignment.status === AssignmentStatus.Accepted && !assignment.submittedAt) {
                didNotSubmitPrior = true;
              }
            }
          }
        }

        if (hasSubmittedPrior) continue;

        const reasons: string[] = [];
        if (didNotSubmitPrior) {
          reasons.push("Warning: Previously accepted but did not submit");
        } else {
          reasons.push("Eligible Lab Member");
        }

        suggestions.push({
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          reasons
        });
      }

      return res.status(200).json(suggestions);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async addProposeReviewer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reviewerId, coordinatorId } = req.body;
      
      if (!reviewerId || !coordinatorId) {
        return res.status(400).json({ message: 'Missing reviewerId or coordinatorId' });
      }

      const userRepo = AppDataSource.getRepository<User>('User');
      const coordinator = await userRepo.findOne({ where: { id: coordinatorId } });
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['proposedReviewers', 'paper', 'paper.authors']
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const authorIds = round.paper.authors?.map(a => a.id) || [];
      if (authorIds.includes(reviewerId)) {
         return res.status(400).json({ message: 'Cannot propose author (Conflict of interest)' });
      }

      const reviewer = await userRepo.findOne({ where: { id: reviewerId } });
      if (!reviewer) return res.status(404).json({ message: 'Reviewer not found' });

      if (!round.proposedReviewers) round.proposedReviewers = [];
      if (!round.proposedReviewers.find(r => r.id === reviewerId)) {
        round.proposedReviewers.push(reviewer);
        await roundRepo.save(round);
      }

      return res.status(200).json(round.proposedReviewers.map(u => ({ id: u.id, name: u.name })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getProposeReviewers(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['proposedReviewers']
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      return res.status(200).json(round.proposedReviewers.map(u => ({ id: u.id, name: u.name })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
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
