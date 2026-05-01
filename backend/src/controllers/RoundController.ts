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
  static async createReviewRound(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { paperId, targetVenue, targetVenueUrl, venueCategory, submissionDeadline, deadline } = req.body;

      if (!paperId || !targetVenue || !venueCategory) {
        return res.status(400).json({ message: 'Missing required fields: paperId, targetVenue, venueCategory' });
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

      const paperRepo = AppDataSource.getRepository(Paper);
      const roundRepo = AppDataSource.getRepository(Round);

      const paper = await paperRepo.findOne({ where: { id: paperId }, relations: ['coordinators', 'authors'] });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isCoordinator = paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      const activeRound = await roundRepo.findOne({
        where: [
          { paper: { id: paperId }, status: RoundStatus.Open },
          { paper: { id: paperId }, status: RoundStatus.Draft },
        ],
      });
      if (activeRound) {
        return res.status(409).json({ message: `A paper can only have one active round at a time. Round ${activeRound.roundNumber} is currently '${activeRound.status}' — it must be Completed before a new round can be created.` });
      }

      const existingRounds = await roundRepo.find({ where: { paper: { id: paperId } } });

      const round = new Round();
      round.paper = paper;
      round.roundNumber = existingRounds.length + 1;
      round.status = RoundStatus.Draft;
      round.targetVenue = targetVenue;
      round.targetVenueUrl = targetVenueUrl ? String(targetVenueUrl).trim() : null;
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

  static async editRoundDeadline(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { id } = req.params;
      const { deadline } = req.body;

      if (!id) return res.status(400).json({ message: 'Missing round id' });
      if (!deadline) return res.status(400).json({ message: 'Missing new deadline' });
      if (isNaN(new Date(deadline).getTime())) return res.status(400).json({ message: 'Invalid deadline format' });

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper', 'paper.coordinators', 'paper.authors'],
      });
      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      if (round.status !== RoundStatus.Draft) {
        return res.status(400).json({ message: `Cannot update deadline: the round is currently '${round.status}'. Deadline changes are only allowed while the round is in Draft status.` });
      }

      const newDeadline = new Date(deadline);
      if (round.submissionDeadline && newDeadline.getTime() > round.submissionDeadline.getTime()) {
        const cap = round.submissionDeadline.toISOString().split('T')[0];
        return res.status(400).json({ message: `Round deadline cannot exceed the conference submission deadline (${cap}).` });
      }

      round.deadline = newDeadline;
      await roundRepo.save(round);

      return res.status(200).json(round);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async updateRoundDetails(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const id = req.params.id as string;
      const { targetVenue, targetVenueUrl, submissionDeadline } = req.body;

      if (targetVenue !== undefined && (typeof targetVenue !== 'string' || !targetVenue.trim())) {
        return res.status(400).json({ message: 'targetVenue must be a non-empty string' });
      }
      if (submissionDeadline !== undefined && submissionDeadline !== null && isNaN(new Date(submissionDeadline).getTime())) {
        return res.status(400).json({ message: 'Invalid submissionDeadline format' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id },
        relations: ['paper', 'paper.coordinators', 'paper.authors'],
      });
      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      if (round.status !== RoundStatus.Draft) {
        return res.status(400).json({ message: `Cannot update round details: the round is currently '${round.status}'. Details can only be changed while the round is in Draft status.` });
      }

      if (targetVenue !== undefined) round.targetVenue = targetVenue.trim();
      if (targetVenueUrl !== undefined) round.targetVenueUrl = targetVenueUrl ? String(targetVenueUrl).trim() : null;
      if (submissionDeadline !== undefined) {
        const newSubDeadline = submissionDeadline ? new Date(submissionDeadline) : null;
        if (newSubDeadline && round.deadline && round.deadline.getTime() > newSubDeadline.getTime()) {
          return res.status(400).json({ message: 'Submission deadline cannot be before the round deadline' });
        }
        round.submissionDeadline = newSubDeadline;
      }

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

  static async suggestReviewers(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { id } = req.params;
      const roundRepo = AppDataSource.getRepository(Round);
      
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: [
          'paper',
          'paper.authors',
          'paper.coordinators',
          'paper.labs',
          'paper.rounds',
          'paper.rounds.assignments',
          'paper.rounds.assignments.reviewer',
          'assignments',
          'assignments.reviewer',
        ]
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

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
        if (user.role === UserRole.Admin || user.role === UserRole.Coordinator) continue;

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

  static async addProposeReviewer(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { id } = req.params;
      const { reviewerId } = req.body;

      if (!reviewerId) {
        return res.status(400).json({ message: 'Missing reviewerId' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['proposedReviewers', 'paper', 'paper.authors', 'paper.coordinators', 'paper.labs'],
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      if (round.status !== RoundStatus.Draft) {
        return res.status(400).json({ message: `Cannot modify proposed reviewers: the round is currently '${round.status}'. The proposed list can only be changed while the round is in Draft status.` });
      }

      const authorIds = round.paper.authors?.map(a => a.id) || [];
      if (authorIds.includes(reviewerId)) {
        return res.status(400).json({ message: 'Cannot propose author (Conflict of interest)' });
      }

      const userRepo = AppDataSource.getRepository<User>('User');
      const reviewer = await userRepo.findOne({ where: { id: reviewerId }, relations: ['labs'] });
      if (!reviewer) return res.status(404).json({ message: 'Reviewer not found' });
      if (reviewer.role === UserRole.Admin || reviewer.role === UserRole.Coordinator) {
        return res.status(400).json({ message: 'Coordinators and admins cannot be proposed as reviewers' });
      }

      const paperLabIds = round.paper.labs?.map(l => l.id) || [];
      const reviewerLabIds = reviewer.labs?.map(l => l.id) || [];
      const sharesLab = reviewerLabIds.some(lid => paperLabIds.includes(lid));
      if (!sharesLab) {
        return res.status(400).json({ message: 'Reviewer must belong to a lab associated with this paper' });
      }

      if (!round.proposedReviewers) round.proposedReviewers = [];
      if (!round.proposedReviewers.find(r => r.id === reviewerId)) {
        round.proposedReviewers.push(reviewer);
        await roundRepo.save(round);
      }

      return res.status(200).json(round.proposedReviewers.map(u => ({ id: u.id, name: u.name, email: u.email })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async removeProposedReviewer(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { id, userId } = req.params;

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['proposedReviewers', 'paper', 'paper.authors', 'paper.coordinators'],
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      if (round.status !== RoundStatus.Draft) {
        return res.status(400).json({ message: `Cannot modify proposed reviewers: the round is currently '${round.status}'. The proposed list can only be changed while the round is in Draft status.` });
      }

      round.proposedReviewers = (round.proposedReviewers ?? []).filter(r => r.id !== userId);
      await roundRepo.save(round);

      return res.status(200).json(round.proposedReviewers.map(u => ({ id: u.id, name: u.name, email: u.email })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getProposeReviewers(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { id } = req.params;
      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['proposedReviewers', 'paper', 'paper.authors', 'paper.coordinators'],
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      return res.status(200).json(round.proposedReviewers.map(u => ({ id: u.id, name: u.name, email: u.email })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async approveRound(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const { id } = req.params;
      const result = await RoundService.approveRound(id as string, coordinator.id);

      return res.status(200).json({
        message: `Round approved and started. ${result.assigned} reviewer(s) assigned, ${result.skipped} skipped.`,
        round: { id: result.round.id, status: result.round.status, startedAt: result.round.startedAt },
        assigned: result.assigned,
        skipped: result.skipped,
      });
    } catch (err) {
      if (err instanceof RoundServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getAuthorRounds(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const paperId = req.params.id as string;
      const paperRepo = AppDataSource.getRepository(Paper);
      const paper = await paperRepo.findOne({
        where: { id: paperId },
        relations: ['authors', 'coordinators'],
      });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isCoordinator = paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const rounds = await roundRepo.find({
        where: { paper: { id: paperId } },
        relations: ['proposedReviewers'],
        order: { roundNumber: 'DESC' },
      });

      return res.status(200).json(rounds.map(r => ({
        id: r.id,
        roundNumber: r.roundNumber,
        status: r.status,
        targetVenue: r.targetVenue,
        venueCategory: r.venueCategory,
        submissionDeadline: r.submissionDeadline,
        deadline: r.deadline,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        proposedReviewers: (r.proposedReviewers ?? []).map(u => ({ id: u.id, name: u.name, email: u.email })),
        aiReviewReport: r.aiReviewReport,
        complianceReport: r.complianceReport,
        annotatedPdfUrl: r.annotatedPdfUrl,
        artifacts: {
          checklistItems: (r.checklistItems ?? []).map(ci => ({ id: ci.id, description: ci.description, isChecked: ci.isChecked })),
          aiReviewReports: (r.aiReviewReports ?? []).map(ar => ({ id: ar.id, generatedReportUrl: ar.generatedReportUrl, annotatedPdfUrl: ar.annotatedPdfUrl }))
        }
      })));
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
        order: { roundNumber: 'DESC' },
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

  static async trackReviewStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const roundId = req.params.id as string;
      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: roundId },
        relations: [
          'paper',
          'paper.coordinators',
          'paper.authors',
          'assignments',
          'assignments.reviewer',
          'assignments.declineRequests',
          'assignments.extensions',
        ],
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not associated with this paper' });
      }

      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const activeStatuses = new Set([
        AssignmentStatus.Invited,
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.PendingDecline,
        AssignmentStatus.Overdue,
      ]);

      const assignments = round.assignments ?? [];

      const statusCounts: Record<string, number> = {};
      for (const s of Object.values(AssignmentStatus)) statusCounts[s] = 0;
      for (const a of assignments) statusCounts[a.status]++;

      const overdueAssignments = assignments
        .filter(a => activeStatuses.has(a.status) && a.deadline && a.deadline < now)
        .map(a => ({
          id: a.id,
          reviewer: { id: a.reviewer.id, name: a.reviewer.name, email: a.reviewer.email },
          status: a.status,
          deadline: a.deadline,
        }));

      const approachingDeadline = assignments
        .filter(a => activeStatuses.has(a.status) && a.deadline && a.deadline >= now && a.deadline <= threeDaysFromNow)
        .map(a => ({
          id: a.id,
          reviewer: { id: a.reviewer.id, name: a.reviewer.name, email: a.reviewer.email },
          status: a.status,
          deadline: a.deadline,
        }));

      const pendingDeclines = assignments.reduce(
        (n, a) => n + (a.declineRequests?.filter(d => d.status === DeclineRequestStatus.Pending).length ?? 0), 0,
      );
      const pendingExtensions = assignments.reduce(
        (n, a) => n + (a.extensions?.filter(e => e.status === ExtensionStatus.Pending).length ?? 0), 0,
      );

      const total = assignments.length;
      const completed = statusCounts[AssignmentStatus.Completed] ?? 0;

      return res.status(200).json({
        id: round.id,
        roundNumber: round.roundNumber,
        status: round.status,
        deadline: round.deadline,
        targetVenue: round.targetVenue,
        venueCategory: round.venueCategory,
        startedAt: round.startedAt,
        completedAt: round.completedAt,
        summary: {
          total,
          completed,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          statusCounts,
          overdueCount: overdueAssignments.length,
          approachingDeadlineCount: approachingDeadline.length,
          pendingDeclineRequests: pendingDeclines,
          pendingExtensionRequests: pendingExtensions,
        },
        overdueAssignments,
        approachingDeadline,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
  static async closeRound(req: Request, res: Response) {
    // Rounds complete automatically when all assignment deadlines pass — no manual close needed.
    res.status(410).json({ message: 'Rounds are completed automatically. Use POST /rounds/:id/start to start a round.' });
  }

  static async startAIReview(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper', 'paper.authors', 'paper.coordinators']
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      // Authorization: Only Authors or Coordinators can trigger
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);

      if (!isAuthor && !isCoordinator) {
        return res.status(403).json({ message: 'Forbidden: You must be an author or coordinator of this paper.' });
      }

      // Get the uploaded PDF from multer
      const file = (req as any).file;
      if (!file || !file.buffer) {
        return res.status(400).json({ message: 'No PDF file uploaded. Please attach a PDF to run the AI review.' });
      }

      // Execute AI Pipeline
      const { AIReviewService } = require('../ai_content/services/AIReviewService');
      const result = await AIReviewService.generateAIReview(round.paper.id, round.id, file.buffer);

      // Persist results
      round.aiReviewReport = result;
      round.annotatedPdfUrl = result.annotatedPdfUrl;
      await roundRepo.save(round);

      return res.status(200).json({
        message: 'AI Post-Review Phase executed successfully',
        data: result
      });

    } catch (err: any) {
      console.error('[RoundController] Error in startAIReview:', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }
  static async getVenueRules(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({ where: { id: id as string } });

      if (!round) return res.status(404).json({ message: 'Round not found' });
      if (!round.targetVenue) return res.status(400).json({ message: 'Round has no target venue configured' });

      const { AIReviewService } = require('../ai_content/services/AIReviewService');
      const rules = await AIReviewService.getVenueRules(round.targetVenue);

      return res.status(200).json(rules);
    } catch (err: any) {
      console.error('[RoundController] Error in getVenueRules:', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  static async runComplianceCheck(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper', 'paper.authors', 'paper.coordinators']
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      // Authorization: Only Authors or Coordinators can trigger
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);

      if (!isAuthor && !isCoordinator) {
        return res.status(403).json({ message: 'Forbidden: You must be an author or coordinator of this paper.' });
      }

      // Get uploaded PDF
      const file = (req as any).file;
      if (!file || !file.buffer) {
        return res.status(400).json({ message: 'No PDF file uploaded. Please attach a PDF to run the compliance check.' });
      }

      // We expect the frontend to pass the manually approved/corrected venue rules
      let venueRules = {};
      if (req.body.venueRules) {
        try {
          venueRules = JSON.parse(req.body.venueRules);
        } catch (e) {
          return res.status(400).json({ message: 'Invalid venueRules format. Expected JSON string.' });
        }
      }

      const { ComplianceService } = require('../ai_content/services/ComplianceService');
      const complianceReport = await ComplianceService.verifyCompliance(
        round.paper.id,
        file.buffer,
        venueRules
      );

      // Persist results
      round.complianceReport = complianceReport;
      await roundRepo.save(round);

      return res.status(200).json({
        message: 'Compliance check completed successfully',
        data: complianceReport
      });
    } catch (err: any) {
      console.error('[RoundController] Error in runComplianceCheck:', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
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
