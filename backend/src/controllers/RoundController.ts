import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Round, RoundStatus, VenueCategory } from '../entities/Round';
import { Paper } from '../entities/Paper';
import { User, UserRole } from '../entities/User';
import { AssignmentStatus } from '../entities/Assignment';
import { DeclineRequestStatus } from '../entities/DeclineRequest';
import { ExtensionStatus } from '../entities/Extension';
import { RoundService, RoundServiceError } from '../services/RoundService';
import type { AuthenticatedRequest } from '../types/auth';

export class RoundController {
  static async createReviewRound(req: Request, res: Response) {
    try {
      const { paperId, coordinatorId, targetVenue, venueCategory, submissionDeadline, deadline } = req.body;

      if (!paperId || !coordinatorId || !targetVenue || !venueCategory) {
        return res.status(400).json({ message: 'Missing required fields: paperId, coordinatorId, targetVenue, venueCategory' });
      }

      if (!Object.values(VenueCategory).includes(venueCategory)) {
        return res.status(400).json({ message: `venueCategory must be one of: ${Object.values(VenueCategory).join(', ')}` });
      }

      if (venueCategory === VenueCategory.Conference && !submissionDeadline) {
        return res.status(400).json({ message: 'submissionDeadline is required for Conference rounds' });
      }

      if (submissionDeadline && isNaN(new Date(submissionDeadline).getTime())) {
        return res.status(400).json({ message: 'Invalid submissionDeadline format' });
      }

      if (deadline && isNaN(new Date(deadline).getTime())) {
        return res.status(400).json({ message: 'Invalid deadline format' });
      }

      if (submissionDeadline && deadline) {
        if (new Date(deadline).getTime() > new Date(submissionDeadline).getTime()) {
          return res.status(400).json({ message: 'Round deadline cannot exceed the submission deadline' });
        }
      }

      const userRepo = AppDataSource.getRepository<User>('User');
      const coordinator = await userRepo.findOne({ where: { id: coordinatorId } });
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const paperRepo = AppDataSource.getRepository(Paper);
      const roundRepo = AppDataSource.getRepository(Round);

      const paper = await paperRepo.findOne({ where: { id: paperId }, relations: ['coordinators'] });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isOwner = paper.coordinators?.some(c => c.id === coordinatorId);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      const activeRound = await roundRepo.findOne({
        where: [
          { paper: { id: paperId }, status: RoundStatus.Open },
          { paper: { id: paperId }, status: RoundStatus.Draft },
        ],
      });
      if (activeRound) {
        return res.status(409).json({ message: 'A paper cannot have more than one active round. The current round must be Completed first.' });
      }

      const existingRounds = await roundRepo.find({ where: { paper: { id: paperId } } });

      const round = new Round();
      round.paper = paper;
      round.roundNumber = existingRounds.length + 1;
      round.status = RoundStatus.Draft;
      round.targetVenue = targetVenue;
      round.venueCategory = venueCategory as VenueCategory;
      round.submissionDeadline = submissionDeadline ? new Date(submissionDeadline) : null;
      round.deadline = deadline ? new Date(deadline) : null;
      round.startedAt = null;
      round.completedAt = null;

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

      if (!id) return res.status(400).json({ message: 'Missing round id' });
      if (!deadline || !coordinatorId) return res.status(400).json({ message: 'Missing new deadline or coordinatorId' });
      if (isNaN(new Date(deadline).getTime())) return res.status(400).json({ message: 'Invalid deadline format' });

      const userRepo = AppDataSource.getRepository<User>('User');
      const coordinator = await userRepo.findOne({ where: { id: coordinatorId } });
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper', 'paper.coordinators'],
      });
      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isOwner = round.paper.coordinators?.some(c => c.id === coordinatorId);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      if (round.status !== RoundStatus.Draft) {
        return res.status(400).json({ message: 'Round deadline can only be changed while the round is in Draft status' });
      }

      const newDeadline = new Date(deadline);
      if (round.submissionDeadline && newDeadline.getTime() > round.submissionDeadline.getTime()) {
        return res.status(400).json({ message: 'Round deadline cannot exceed the submission deadline' });
      }

      round.deadline = newDeadline;
      await roundRepo.save(round);

      return res.status(200).json(round);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async startRound(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { coordinatorId } = req.body;

      if (!id || !coordinatorId) {
        return res.status(400).json({ message: 'Missing round id or coordinatorId' });
      }

      const round = await RoundService.startRound(id as string, coordinatorId);
      return res.status(200).json(round);
    } catch (err) {
      if (err instanceof RoundServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
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
          'paper.rounds.assignments.reviewer',
          'assignments',
          'assignments.reviewer',
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
        // Admins and Coordinators cannot be reviewers
        if (user.role === UserRole.GlobalAdmin || user.role === UserRole.LocalAdmin || user.role === UserRole.Coordinator) continue;

        // Enforce Intra-Lab boundaries
        const userLabIds = user.labs?.map(l => l.id) || [];
        const sharesLab = userLabIds.some(lid => paperLabIds.includes(lid));
        if (!sharesLab) continue;

        // Hard COI: Author
        if (authorIds.includes(user.id)) continue;

        // Exclude anyone who has any assignment in this round (active or terminal)
        const hasAnyAssignment = round.assignments?.some(a => a.reviewer.id === user.id);
        if (hasAnyAssignment) continue;

        // Rule #8: Completed a review in a previous round → permanently ineligible for this paper
        let hasSubmittedPrior = false;
        let didNotSubmitPrior = false;

        if (paper.rounds) {
          for (const r of paper.rounds) {
            if (r.id === round.id) continue;
            const assignment = r.assignments?.find(a => a.reviewer.id === user.id);
            if (assignment) {
              if (assignment.status === AssignmentStatus.Completed || assignment.submittedAt) {
                hasSubmittedPrior = true;
              } else if ([AssignmentStatus.Accepted, AssignmentStatus.Overdue, AssignmentStatus.PendingExtension].includes(assignment.status) && !assignment.submittedAt) {
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
  static async getRoundsWithAssignments(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const paperId = req.params.id as string;
      const paperRepo = AppDataSource.getRepository(Paper);
      const paper = await paperRepo.findOne({
        where: { id: paperId },
        relations: ['coordinators'],
      });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isOwner = paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      const roundRepo = AppDataSource.getRepository(Round);
      const rounds = await roundRepo.find({
        where: { paper: { id: paperId } },
        relations: [
          'assignments',
          'assignments.reviewer',
          'assignments.declineRequests',
          'assignments.extensions',
          'assignments.reviewSummary',
        ],
        order: { roundNumber: 'ASC' },
      });

      const formatted = rounds.map(round => ({
        id: round.id,
        roundNumber: round.roundNumber,
        deadline: round.deadline,
        status: round.status,
        targetVenue: round.targetVenue,
        venueCategory: round.venueCategory,
        submissionDeadline: round.submissionDeadline,
        startedAt: round.startedAt,
        completedAt: round.completedAt,
        assignments: (round.assignments ?? []).map(a => ({
          id: a.id,
          status: a.status,
          deadline: a.deadline,
          invitationSent: a.invitationSent,
          reviewer: { id: a.reviewer.id, name: a.reviewer.name, email: a.reviewer.email },
          pendingDeclineRequest: a.declineRequests?.find(d => d.status === DeclineRequestStatus.Pending) ?? null,
          pendingExtensionRequest: a.extensions?.find(e => e.status === ExtensionStatus.Pending) ?? null,
          reviewSummary: a.reviewSummary ? { text: a.reviewSummary.text, submittedAt: a.reviewSummary.submittedAt } : null,
        })),
      }));

      return res.status(200).json(formatted);
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
    // Rounds complete automatically when all assignment deadlines pass — no manual close needed.
    res.status(410).json({ message: 'Rounds are completed automatically. Use POST /rounds/:id/start to start a round.' });
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
