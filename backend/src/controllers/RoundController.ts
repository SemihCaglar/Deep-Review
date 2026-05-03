import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Round, RoundStatus, VenueCategory } from '../entities/Round';
import { Paper } from '../entities/Paper';
import { User, UserRole } from '../entities/User';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { DeclineRequestStatus } from '../entities/DeclineRequest';
import { ExtensionStatus } from '../entities/Extension';
import { SubmissionRuleSet } from '../entities/SubmissionRuleSet';
import { AIReviewReport } from '../entities/AIReviewReport';
import { RoundService, RoundServiceError } from '../services/RoundService';
import { sendTemplatedEmail } from '../services/emailService';
import { TemplateName } from '../entities/Template';
import { ComplianceCheckAgentService } from '../ai_content/services/ComplianceCheckAgentService';
import { runChecklistAnswers, getStoredChecklistAnswers } from '../ai_content/services/EmpiricalChecklistOrchestrationService';
import type { AuthenticatedRequest } from '../types/auth';

export class RoundController {
  private static parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' && !(value instanceof Date)) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private static parseRequiredUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  private static isBeforeTodayUtc(value: Date): boolean {
    const todayUtc = new Date().toISOString().split('T')[0];
    const valueUtc = value.toISOString().split('T')[0];
    return valueUtc < todayUtc;
  }

  private static async getReviewerIdsWithSubmittedReviewForPaper(paperId: string): Promise<Set<string>> {
    const rows = await AppDataSource.getRepository(Assignment)
      .createQueryBuilder('assignment')
      .innerJoin('assignment.round', 'round')
      .innerJoin('round.paper', 'paper')
      .innerJoin('assignment.reviewer', 'reviewer')
      .select('reviewer.id', 'reviewerId')
      .distinct(true)
      .where('paper.id = :paperId', { paperId })
      .andWhere('(assignment.status = :completed OR assignment.submittedAt IS NOT NULL)', {
        completed: AssignmentStatus.Completed,
      })
      .getRawMany<{ reviewerId: string }>();

    return new Set(rows.map(row => row.reviewerId));
  }

  private static formatReviewersWithReviewContext(users: User[], submittedReviewerIds: Set<string>) {
    return users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      hasPreviouslyCompletedReview: submittedReviewerIds.has(u.id),
    }));
  }

  static async createReviewRound(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { paperId, targetVenue, targetVenueUrl, venueCategory, submissionDeadline, deadline } = req.body;

      if (!paperId || !targetVenue || !venueCategory) {
        return res.status(400).json({ message: 'Missing required fields: paperId, targetVenue, venueCategory' });
      }

      const normalizedVenueUrl = RoundController.parseRequiredUrl(targetVenueUrl);
      if (!normalizedVenueUrl) {
        return res.status(400).json({ message: 'targetVenueUrl is required and must start with http:// or https://' });
      }

      if (!Object.values(VenueCategory).includes(venueCategory)) {
        return res.status(400).json({ message: `venueCategory must be one of: ${Object.values(VenueCategory).join(', ')}` });
      }

      if (venueCategory === VenueCategory.Conference && !submissionDeadline) {
        return res.status(400).json({ message: 'submissionDeadline is required for Conference rounds' });
      }

      const parsedSubmissionDeadline = submissionDeadline ? RoundController.parseDate(submissionDeadline) : null;
      const parsedDeadline = deadline ? RoundController.parseDate(deadline) : null;

      if (submissionDeadline && !parsedSubmissionDeadline) {
        return res.status(400).json({ message: 'Invalid submissionDeadline format' });
      }

      if (deadline && !parsedDeadline) {
        return res.status(400).json({ message: 'Invalid deadline format' });
      }

      if (parsedSubmissionDeadline && RoundController.isBeforeTodayUtc(parsedSubmissionDeadline)) {
        return res.status(400).json({ message: 'Submission deadline cannot be before today (UTC)' });
      }

      if (parsedDeadline && RoundController.isBeforeTodayUtc(parsedDeadline)) {
        return res.status(400).json({ message: 'Round deadline cannot be before today (UTC)' });
      }

      if (parsedSubmissionDeadline && parsedDeadline) {
        if (parsedDeadline.getTime() > parsedSubmissionDeadline.getTime()) {
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

      const now = new Date();
      const roundWithFutureDeadline = existingRounds.find(r => 
        r.submissionDeadline && r.submissionDeadline.getTime() > now.getTime()
      );
      if (roundWithFutureDeadline) {
        return res.status(400).json({ message: 'Cannot create a new round while a previous round has a submission deadline in the future' });
      }

      const round = new Round();
      round.paper = paper;
      round.roundNumber = existingRounds.length + 1;
      round.status = RoundStatus.Draft;
      round.targetVenue = targetVenue;
      round.targetVenueUrl = normalizedVenueUrl;
      round.venueCategory = venueCategory as VenueCategory;
      round.submissionDeadline = parsedSubmissionDeadline;
      round.deadline = parsedDeadline;
      round.startedAt = null;
      round.completedAt = null;
      round.createdByCoordinator = isCoordinator;

      await roundRepo.save(round);

      // Extract submission rules asynchronously (non-blocking)
      if (normalizedVenueUrl) {
        RoundService.extractAndLinkRules(round.id, normalizedVenueUrl).catch(err => {
          console.warn('[RoundController] Background rule extraction failed:', err);
        });
      }

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
      const newDeadline = RoundController.parseDate(deadline);
      if (!newDeadline) return res.status(400).json({ message: 'Invalid deadline format' });
      if (RoundController.isBeforeTodayUtc(newDeadline)) {
        return res.status(400).json({ message: 'Round deadline cannot be before today (UTC)' });
      }

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

      if (round.status === RoundStatus.Completed) {
        return res.status(400).json({ message: `Cannot update deadline: the round is already completed.` });
      }

      if (round.submissionDeadline && newDeadline.getTime() > round.submissionDeadline.getTime()) {
        const cap = round.submissionDeadline.toISOString().split('T')[0];
        return res.status(400).json({ message: `Round deadline cannot exceed the conference submission deadline (${cap}).` });
      }

      round.deadline = newDeadline;
      await roundRepo.save(round);

      if (round.status === RoundStatus.Open) {
        const assignmentRepo = AppDataSource.getRepository(Assignment);
        const activeStatuses = [
          AssignmentStatus.Invited,
          AssignmentStatus.Accepted,
          AssignmentStatus.PendingExtension,
          AssignmentStatus.PendingDecline,
          AssignmentStatus.Overdue,
        ];
        const assignments = await assignmentRepo.find({
          where: { round: { id: round.id } },
          relations: ['reviewer'],
        });
        const toUpdate = assignments.filter(a => activeStatuses.includes(a.status));
        if (toUpdate.length > 0) {
          for (const a of toUpdate) a.deadline = newDeadline;
          await assignmentRepo.save(toUpdate);

          const formattedDeadline = newDeadline.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          await Promise.allSettled(toUpdate.map(a =>
            sendTemplatedEmail(a.reviewer, TemplateName.REVIEW_DEADLINE_UPDATED, {
              userName: a.reviewer.name,
              paperTitle: round.paper.title,
              venue: round.targetVenue,
              newDeadline: formattedDeadline,
            })
          ));
        }
      }

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
      const { targetVenue, targetVenueUrl, venueCategory, submissionDeadline } = req.body;

      if (targetVenue !== undefined && (typeof targetVenue !== 'string' || !targetVenue.trim())) {
        return res.status(400).json({ message: 'targetVenue must be a non-empty string' });
      }
      const newSubDeadline = submissionDeadline !== undefined && submissionDeadline !== null
        ? RoundController.parseDate(submissionDeadline)
        : null;

      if (submissionDeadline !== undefined && submissionDeadline !== null && !newSubDeadline) {
        return res.status(400).json({ message: 'Invalid submissionDeadline format' });
      }

      if (newSubDeadline && RoundController.isBeforeTodayUtc(newSubDeadline)) {
        return res.status(400).json({ message: 'Submission deadline cannot be before today (UTC)' });
      }

      if (targetVenueUrl !== undefined && !RoundController.parseRequiredUrl(targetVenueUrl)) {
        return res.status(400).json({ message: 'targetVenueUrl is required and must start with http:// or https://' });
      }

      if (venueCategory !== undefined && !Object.values(VenueCategory).includes(venueCategory)) {
        return res.status(400).json({ message: `venueCategory must be one of: ${Object.values(VenueCategory).join(', ')}` });
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

      if (round.status === RoundStatus.Completed) {
        return res.status(400).json({ message: `Cannot update round details: the round is already completed.` });
      }

      const isOpen = round.status === RoundStatus.Open;
      const hasNonDeadlineChanges = targetVenue !== undefined || targetVenueUrl !== undefined || venueCategory !== undefined;
      if (isOpen && hasNonDeadlineChanges) {
        return res.status(400).json({ message: `Cannot update venue details while the round is Open. Only the submission deadline can be changed.` });
      }

      let urlUpdated = false;
      if (targetVenue !== undefined) round.targetVenue = targetVenue.trim();
      if (targetVenueUrl !== undefined) {
        const newUrl = RoundController.parseRequiredUrl(targetVenueUrl);
        if (newUrl !== round.targetVenueUrl) {
          round.targetVenueUrl = newUrl;
          urlUpdated = true;
        }
      }
      if (venueCategory !== undefined) round.venueCategory = venueCategory as VenueCategory;
      if (submissionDeadline !== undefined) {
        if (newSubDeadline && round.deadline && round.deadline.getTime() > newSubDeadline.getTime()) {
          return res.status(400).json({ message: 'Submission deadline cannot be before the round deadline' });
        }
        round.submissionDeadline = newSubDeadline;
      }

      await roundRepo.save(round);

      if (submissionDeadline !== undefined && newSubDeadline) {
        const formattedDeadline = newSubDeadline.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const recipients = [
          ...(round.paper.authors ?? []),
          ...(round.paper.coordinators ?? []),
        ].filter((u, idx, arr) => u.id !== user.id && arr.findIndex(x => x.id === u.id) === idx);

        await Promise.allSettled(recipients.map(recipient =>
          sendTemplatedEmail(recipient, TemplateName.SUBMISSION_DEADLINE_UPDATED, {
            userName: recipient.name,
            paperTitle: round.paper.title,
            venue: round.targetVenue,
            newDeadline: formattedDeadline,
          })
        ));
      }

      // Extract submission rules if URL was updated (async, non-blocking)
      if (urlUpdated && round.targetVenueUrl) {
        RoundService.extractAndLinkRules(round.id, round.targetVenueUrl).catch(err => {
          console.warn('[RoundController] Background rule extraction failed:', err);
        });
      }

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
      const submittedReviewerIds = await RoundController.getReviewerIdsWithSubmittedReviewForPaper(paper.id);

      let suggestions = [];

      for (const user of candidates) {
        // Admins and Coordinators cannot be reviewers
        if (user.role === UserRole.Admin || user.role === UserRole.Coordinator) continue;

        // Frozen (alumni) members cannot be reviewers
        if (user.frozenAt) continue;

        // Enforce Intra-Lab boundaries
        const userLabIds = user.labs?.map(l => l.id) || [];
        const sharesLab = userLabIds.some(lid => paperLabIds.includes(lid));
        if (!sharesLab) continue;

        // Hard COI: Author
        if (authorIds.includes(user.id)) continue;

        // Exclude anyone who has any assignment in this round (active or terminal)
        const hasAnyAssignment = round.assignments?.some(a => a.reviewer.id === user.id);
        if (hasAnyAssignment) continue;

        // Previous rounds do not make someone ineligible for this paper.
        // They only add context for the coordinator/author while choosing reviewers.
        const hasSubmittedReviewForPaper = submittedReviewerIds.has(user.id);
        let didNotSubmitPrior = false;

        if (paper.rounds) {
          for (const r of paper.rounds) {
            if (r.id === round.id) continue;
            const assignment = r.assignments?.find(a => a.reviewer.id === user.id);
            if (assignment) {
              if ([AssignmentStatus.Accepted, AssignmentStatus.Overdue, AssignmentStatus.PendingExtension].includes(assignment.status) && !assignment.submittedAt) {
                didNotSubmitPrior = true;
              }
            }
          }
        }

        const reasons: string[] = [];
        if (hasSubmittedReviewForPaper) {
          reasons.push("Warning: Previously completed a review for this paper");
        } else if (didNotSubmitPrior) {
          reasons.push("Warning: Previously accepted but did not submit");
        } else {
          reasons.push("Eligible Lab Member");
        }

        suggestions.push({
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          hasPreviouslyCompletedReview: hasSubmittedReviewForPaper,
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
      
      if (reviewer.frozenAt) {
        return res.status(400).json({ message: 'Frozen members (Alumni) cannot be proposed as reviewers' });
      }

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

      const submittedReviewerIds = await RoundController.getReviewerIdsWithSubmittedReviewForPaper(round.paper.id);
      return res.status(200).json(RoundController.formatReviewersWithReviewContext(round.proposedReviewers, submittedReviewerIds));
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

      const submittedReviewerIds = await RoundController.getReviewerIdsWithSubmittedReviewForPaper(round.paper.id);
      return res.status(200).json(RoundController.formatReviewersWithReviewContext(round.proposedReviewers, submittedReviewerIds));
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

      const submittedReviewerIds = await RoundController.getReviewerIdsWithSubmittedReviewForPaper(round.paper.id);
      return res.status(200).json(RoundController.formatReviewersWithReviewContext(round.proposedReviewers ?? [], submittedReviewerIds));
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
      const openRounds = await roundRepo.find({
        where: { paper: { id: paperId }, status: RoundStatus.Open },
        select: ['id'],
      });
      for (const round of openRounds) {
        await RoundService.completeRoundIfAllAssignmentsTerminal(round.id);
      }

      const rounds = await roundRepo.find({
        where: { paper: { id: paperId } },
        relations: ['proposedReviewers', 'checklistItems', 'aiReviewReports', 'aiReviewReports.requestedBy'],
        order: { roundNumber: 'DESC' },
      });

      const submittedReviewerIds = await RoundController.getReviewerIdsWithSubmittedReviewForPaper(paperId);

      return res.status(200).json(rounds.map(r => ({
        id: r.id,
        roundNumber: r.roundNumber,
        status: r.status,
        targetVenue: r.targetVenue,
        targetVenueUrl: r.targetVenueUrl,
        venueCategory: r.venueCategory,
        submissionDeadline: r.submissionDeadline,
        deadline: r.deadline,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        proposedReviewers: RoundController.formatReviewersWithReviewContext(
          r.proposedReviewers ?? [],
          submittedReviewerIds,
        ),
        aiReviewReport: r.aiReviewReport,
        complianceReport: r.complianceReport ?? null,
        referenceVerificationReport: r.referenceVerificationReport ?? null,
        annotatedPdfUrl: r.annotatedPdfUrl,
        checklistJson: r.checklistJson ?? null,
        checklistUrl: r.checklistUrl ?? null,
        confirmedChecklistJson: r.confirmedChecklistJson ?? null,
        aiReviewReports: (r.aiReviewReports ?? [])
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map(ar => ({ id: ar.id, reviewText: ar.reviewText, annotatedPdfUrl: ar.annotatedPdfUrl, venue: ar.venue, createdAt: ar.createdAt })),
        artifacts: {
          checklistItems: (r.checklistItems ?? []).map(ci => ({ id: ci.id, description: ci.description, isChecked: ci.isChecked })),
          aiReviewReports: (r.aiReviewReports ?? [])
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map(ar => ({ id: ar.id, reviewText: ar.reviewText, annotatedPdfUrl: ar.annotatedPdfUrl, venue: ar.venue, createdAt: ar.createdAt }))
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
      const openRounds = await roundRepo.find({
        where: { paper: { id: paperId }, status: RoundStatus.Open },
        select: ['id'],
      });
      for (const round of openRounds) {
        await RoundService.completeRoundIfAllAssignmentsTerminal(round.id);
      }

      const rounds = await roundRepo.find({
        where: { paper: { id: paperId } },
        relations: [
          'aiReviewReports',
          'aiReviewReports.requestedBy',
          'assignments',
          'assignments.reviewer',
          'assignments.declineRequests',
          'assignments.extensions',
          'assignments.reviewSummary',
        ],
        order: { roundNumber: 'DESC' },
      });

      const submittedReviewerIds = await RoundController.getReviewerIdsWithSubmittedReviewForPaper(paperId);

      const formatted = rounds.map(round => ({
        id: round.id,
        roundNumber: round.roundNumber,
        deadline: round.deadline,
        status: round.status,
        targetVenue: round.targetVenue,
        targetVenueUrl: round.targetVenueUrl,
        venueCategory: round.venueCategory,
        submissionDeadline: round.submissionDeadline,
        startedAt: round.startedAt,
        completedAt: round.completedAt,
        createdByCoordinator: round.createdByCoordinator ?? false,
        aiReviewReport: round.aiReviewReport ?? null,
        annotatedPdfUrl: round.annotatedPdfUrl ?? null,
        complianceReport: round.complianceReport ?? null,
        referenceVerificationReport: round.referenceVerificationReport ?? null,
        checklistJson: round.checklistJson ?? null,
        checklistUrl: round.checklistUrl ?? null,
        confirmedChecklistJson: round.confirmedChecklistJson ?? null,
        aiReviewReports: (round.aiReviewReports ?? [])
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map(ar => ({
            id: ar.id,
            reviewText: ar.reviewText,
            annotatedPdfUrl: ar.annotatedPdfUrl,
            venue: ar.venue,
            createdAt: ar.createdAt,
          })),
        assignments: (round.assignments ?? []).map(a => ({
          id: a.id,
          status: a.status,
          deadline: a.deadline,
          invitationSent: a.invitationSent,
          reviewer: { id: a.reviewer.id, name: a.reviewer.name, email: a.reviewer.email },
          hasPreviouslyCompletedReview: submittedReviewerIds.has(a.reviewer.id),
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
      const submittedReviewerIds = await RoundController.getReviewerIdsWithSubmittedReviewForPaper(round.paper.id);

      const statusCounts: Record<string, number> = {};
      for (const s of Object.values(AssignmentStatus)) statusCounts[s] = 0;
      for (const a of assignments) statusCounts[a.status]++;

      const overdueAssignments = assignments
        .filter(a => activeStatuses.has(a.status) && a.deadline && a.deadline < now)
        .map(a => ({
          id: a.id,
          reviewer: { id: a.reviewer.id, name: a.reviewer.name, email: a.reviewer.email },
          hasPreviouslyCompletedReview: submittedReviewerIds.has(a.reviewer.id),
          status: a.status,
          deadline: a.deadline,
        }));

      const approachingDeadline = assignments
        .filter(a => activeStatuses.has(a.status) && a.deadline && a.deadline >= now && a.deadline <= threeDaysFromNow)
        .map(a => ({
          id: a.id,
          reviewer: { id: a.reviewer.id, name: a.reviewer.name, email: a.reviewer.email },
          hasPreviouslyCompletedReview: submittedReviewerIds.has(a.reviewer.id),
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
      const completedByReconciliation = await RoundService.completeRoundIfAllAssignmentsTerminal(round.id);

      return res.status(200).json({
        id: round.id,
        roundNumber: round.roundNumber,
        status: completedByReconciliation ? RoundStatus.Completed : round.status,
        deadline: round.deadline,
        targetVenue: round.targetVenue,
        venueCategory: round.venueCategory,
        startedAt: round.startedAt,
        completedAt: completedByReconciliation ? new Date() : round.completedAt,
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
      if (round.status === RoundStatus.Draft) {
        return res.status(400).json({ message: 'AI review can only be run after the round has started.' });
      }

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
      round.checklistJson = result.checklistJson ?? null;
      round.checklistUrl = result.checklistUrl ?? null;
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

  static async startAIReviewEndpoint(req: AuthenticatedRequest, res: Response) {
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
      if (round.status === RoundStatus.Draft) {
        return res.status(400).json({ message: 'Peer review can only be run after the round has started.' });
      }

      // Authorization: Only Authors or Coordinators can trigger
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);

      if (!isAuthor && !isCoordinator) {
        return res.status(403).json({ message: 'Forbidden: You must be an author or coordinator of this paper.' });
      }

      // Get the uploaded PDF from multer
      const file = (req as any).file;
      if (!file || !file.buffer) {
        return res.status(400).json({ message: 'No PDF file uploaded. Please attach a PDF to run peer review.' });
      }

      // Execute Peer Review Pipeline
      const { PdfAgentService } = require('../ai_content/services/PdfAgentService');
      const { AIReviewReport } = require('../entities/AIReviewReport');

      const agentService = new PdfAgentService();
      const inputFilename = `paper_${round.paper.id}_round_${round.id}.pdf`;

      console.log(`[RoundController] PDF received: ${file.originalname || 'unknown'} (${file.buffer.length} bytes)`);
      console.log(`[RoundController] Uploading PDF for peer review as: ${inputFilename}...`);
      const fileId = await agentService.uploadPdf(file.buffer, inputFilename);
      console.log(`[RoundController] File uploaded to Azure with ID: ${fileId}`);

      const venueName = round.targetVenue || 'the conference';
      console.log(`[RoundController] Running peer review...`);
      const reviewResult = await agentService.runAnnotatedReview(fileId);

      // Log the review result
      const titleMatch = reviewResult.summaryText.match(/## Paper Title\n(.*?)($|\n)/);
      const reviewTitle = titleMatch ? titleMatch[1].trim() : 'Unknown';
      console.log(`[RoundController] Review completed. Paper title: "${reviewTitle}"`);
      console.log(`[RoundController] Review text length: ${reviewResult.summaryText.length} chars, PDF generated: ${reviewResult.annotatedPdfBuffer ? 'YES' : 'NO'}`);

      // Save annotated PDF if present
      let annotatedPdfUrl: string | null = null;
      if (reviewResult.annotatedPdfBuffer) {
        const fs = require('fs');
        const path = require('path');
        const outputFilename = `paper_${round.paper.id}_round_${round.id}_review.pdf`;
        const downloadsDir = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
        fs.writeFileSync(path.join(downloadsDir, outputFilename), reviewResult.annotatedPdfBuffer);
        annotatedPdfUrl = `/downloads/${outputFilename}`;
        console.log(`[RoundController] Review annotated PDF saved to ${annotatedPdfUrl}`);
      }

      // Persist review to AIReviewReport collection
      const aiReviewReport = new AIReviewReport();
      aiReviewReport.reviewText = reviewResult.summaryText;
      aiReviewReport.annotatedPdfUrl = annotatedPdfUrl;
      aiReviewReport.venue = venueName;
      aiReviewReport.round = round;
      aiReviewReport.requestedBy = user as any;

      const aiReviewReportRepo = AppDataSource.getRepository(AIReviewReport);
      await aiReviewReportRepo.save(aiReviewReport);

      console.log(`[RoundController] Review saved to AIReviewReport collection`);

      return res.status(200).json({
        message: 'Peer review completed',
        data: {
          reviewText: reviewResult.summaryText,
          annotatedPdfUrl,
          venue: venueName,
          reviewId: aiReviewReport.id,
        }
      });

    } catch (err: any) {
      console.error('[RoundController] Error in startAIReviewEndpoint:', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  static async startAIChecklist(req: AuthenticatedRequest, res: Response) {
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
      if (round.status === RoundStatus.Draft) {
        return res.status(400).json({ message: 'Checklist analysis can only be run after the round has started.' });
      }

      // Authorization: Only Authors or Coordinators can trigger
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);

      if (!isAuthor && !isCoordinator) {
        return res.status(403).json({ message: 'Forbidden: You must be an author or coordinator of this paper.' });
      }

      // Get the uploaded PDF from multer
      const file = (req as any).file;
      if (!file || !file.buffer) {
        return res.status(400).json({ message: 'No PDF file uploaded. Please attach a PDF to run checklist analysis.' });
      }

      // Execute Checklist-only Pipeline
      const { PdfAgentService } = require('../ai_content/services/PdfAgentService');
      const { ChecklistService } = require('../ai_content/services/ChecklistService');

      const agentService = new PdfAgentService();
      const inputFilename = `paper_${round.paper.id}_round_${round.id}.pdf`;

      console.log(`[RoundController] PDF received: ${file.originalname || 'unknown'} (${file.buffer.length} bytes)`);
      console.log(`[RoundController] Uploading PDF for checklist analysis as: ${inputFilename}...`);
      const fileId = await agentService.uploadPdf(file.buffer, inputFilename);
      console.log(`[RoundController] File uploaded to Azure with ID: ${fileId}`);

      console.log(`[RoundController] Running checklist analysis...`);
      const raw = await agentService.runChecklistAnalysis(fileId);
      console.log(`[RoundController] Raw checklist result: ${raw.selectedStandards.length} standards found (before filtering)`, raw);
      const filtered = ChecklistService.filterValidStandards(raw.selectedStandards);
      console.log(`[RoundController] Filtered checklist result: ${filtered.length} standards after validation`, filtered);
      const checklistJson = { selectedStandards: filtered };
      const checklistUrl = ChecklistService.buildEmpiricalStandardsUrl(filtered.map((s: any) => s.label));

      // Persist results
      round.checklistJson = checklistJson;
      round.checklistUrl = checklistUrl;
      const saved = await roundRepo.save(round);
      console.log(`[RoundController] Checklist saved to database:`, {
        roundId: saved.id,
        checklistJson: saved.checklistJson,
        checklistUrl: saved.checklistUrl,
      });

      const response = {
        message: 'Checklist analysis completed',
        data: {
          checklistJson,
          checklistUrl,
        }
      };
      console.log(`[RoundController] Returning response:`, response);
      return res.status(200).json(response);

    } catch (err: any) {
      console.error('[RoundController] Error in startAIChecklist:', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  static async confirmChecklistSelection(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { selectedStandards } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!Array.isArray(selectedStandards)) {
        return res.status(400).json({ message: 'selectedStandards must be an array of strings' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper', 'paper.authors', 'paper.coordinators']
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      // Authorization: Only Authors or Coordinators can confirm
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);

      if (!isAuthor && !isCoordinator) {
        return res.status(403).json({ message: 'Forbidden: You must be an author or coordinator of this paper.' });
      }

      // Save confirmed checklist
      round.confirmedChecklistJson = {
        selectedStandards,
        confirmedAt: new Date().toISOString(),
        confirmedBy: user.id,
      };

      await roundRepo.save(round);

      return res.status(200).json({
        message: 'Checklist selection confirmed',
        data: round.confirmedChecklistJson
      });

    } catch (err: any) {
      console.error('[RoundController] Error in confirmChecklistSelection:', err);
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
      if (round.status === RoundStatus.Draft) {
        return res.status(400).json({ message: 'Compliance check can only be run after the round has started.' });
      }

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

      if (!round.submissionRuleSetId) {
        return res.status(400).json({ message: 'No submission rules linked to this round. Add a rule set first.' });
      }

      const ruleSetRepo = AppDataSource.getRepository(SubmissionRuleSet);
      const ruleSet = await ruleSetRepo.findOne({ where: { id: round.submissionRuleSetId } });
      if (!ruleSet) {
        return res.status(404).json({ message: 'Submission rule set not found.' });
      }

      const complianceService = new ComplianceCheckAgentService();
      const fileId = await complianceService.uploadPdf(file.buffer, `round_${id}_compliance.pdf`);
      const { complianceReport } = await complianceService.runComplianceCheck(fileId, {
        sourceUrl: ruleSet.sourceUrl,
        rules: ruleSet.rules,
      });

      // Persist results per requesting user so authors/coordinators do not overwrite each other's reports.
      round.complianceReportsByUser = {
        ...(round.complianceReportsByUser ?? {}),
        [user.id]: {
          report: complianceReport,
          createdAt: new Date().toISOString(),
        },
      };
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

  static async runAIReviewWithCompliance(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { id } = req.params;
      const file = req.file;

      if (!id) return res.status(400).json({ message: 'Missing round id' });
      if (!file) return res.status(400).json({ message: 'PDF file is required' });

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper', 'paper.coordinators', 'paper.authors']
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      console.log(`[RoundController] Starting combined AI Review + Compliance check for round ${id}`);

      // STEP 1: Compliance Check (if rules are linked)
      let complianceReport = null;
      let complianceSourceUrl = null;

      console.log(`[RoundController] ========== STEP 1: COMPLIANCE CHECK ==========`);
      console.log(`[RoundController] Round: ${id}`);
      console.log(`[RoundController] Submission Rule Set ID: ${round.submissionRuleSetId || 'None'}`);
      console.log(`[RoundController] PDF size: ${file.buffer.length} bytes`);

      if (round.submissionRuleSetId) {
        try {
          console.log(`[RoundController] Fetching submission rules...`);
          const ruleSetRepo = AppDataSource.getRepository(SubmissionRuleSet);
          const ruleSet = await ruleSetRepo.findOne({ where: { id: round.submissionRuleSetId } });

          if (ruleSet) {
            console.log(`[RoundController] ✓ Rules found for: ${ruleSet.sourceUrl}`);
            console.log(`[RoundController] Uploading PDF for compliance check...`);
            const complianceService = new ComplianceCheckAgentService();
            const fileId = await complianceService.uploadPdf(file.buffer, `round_${id}_compliance.pdf`);
            console.log(`[RoundController] ✓ PDF uploaded, file ID: ${fileId}`);

            console.log(`[RoundController] Running compliance check agent...`);
            const { complianceReport: report } = await complianceService.runComplianceCheck(fileId, {
              sourceUrl: ruleSet.sourceUrl,
              rules: ruleSet.rules
            });
            complianceReport = report;
            complianceSourceUrl = ruleSet.sourceUrl;

            // Log results summary
            const passCount = Object.values(report).filter(r => r.status === 'pass').length;
            const failCount = Object.values(report).filter(r => r.status === 'fail').length;
            const skipCount = Object.values(report).filter(r => r.status === 'skipped').length;
            console.log(`[RoundController] ✓ Compliance check completed: ${passCount} pass, ${failCount} fail, ${skipCount} skipped`);
          } else {
            console.warn(`[RoundController] Rule set ID ${round.submissionRuleSetId} not found in database`);
          }
        } catch (error) {
          console.error(`[RoundController] ❌ Compliance check failed (continuing with AI review):`, error);
          console.warn(`[RoundController] Compliance report will be null, proceeding with AI review only`);
        }
      } else {
        console.log(`[RoundController] ⚪ No submission rules linked, skipping compliance check`);
      }
      console.log(`[RoundController] ================================================\n`);

      // STEP 2: AI Review
      console.log(`[RoundController] ========== STEP 2: AI REVIEW ==========`);
      console.log(`[RoundController] Running AI review agent...`);
      const { AIReviewService } = require('../ai_content/services/AIReviewService');
      const skipChecklistGeneration = !!round.checklistJson;
      if (skipChecklistGeneration) {
        console.log(`[RoundController] ⚪ Checklist already exists, will skip generation`);
      }
      const aiReviewResult = await AIReviewService.generateAIReview(
        round.paper.id,
        id,
        file.buffer,
        skipChecklistGeneration
      );
      console.log(`[RoundController] ✓ AI review completed`);
      console.log(`[RoundController] Review length: ${aiReviewResult.summaryReport?.length || 0} chars`);
      console.log(`[RoundController] Annotated PDF: ${aiReviewResult.annotatedPdfUrl ? '✓ generated' : '✗ not generated'}`);
      console.log(`[RoundController] Checklist: ${aiReviewResult.checklistJson?.selectedStandards?.length || 0} standards selected`);
      console.log(`[RoundController] =========================================\n`);

      // STEP 3: Reference Verification (included in aiReviewResult)
      console.log(`[RoundController] ========== STEP 3: REFERENCE VERIFICATION ==========`);
      const refVerifReport = aiReviewResult.referenceVerificationReport;
      if (refVerifReport) {
        console.log(`[RoundController] ✓ Reference verification: ${refVerifReport.verifiedCount}/${refVerifReport.totalReferences} verified`);
        if (refVerifReport.issues && refVerifReport.issues.length > 0) {
          console.warn(`[RoundController] Reference verification issues: ${refVerifReport.issues.join('; ')}`);
        }
      }
      console.log(`[RoundController] ==================================================\n`);

      // STEP 4: Save results to database
      console.log(`[RoundController] Saving results to database...`);

      // Create new AIReviewReport record for this run
      const aiReviewReportRepo = AppDataSource.getRepository(AIReviewReport);
      const aiReviewReport = new AIReviewReport();
      aiReviewReport.reviewText = aiReviewResult.summaryReport;
      aiReviewReport.annotatedPdfUrl = aiReviewResult.annotatedPdfUrl;
      aiReviewReport.complianceReport = complianceReport;
      aiReviewReport.referenceVerificationReport = aiReviewResult.referenceVerificationReport;
      aiReviewReport.venue = round.targetVenue;
      aiReviewReport.round = round;
      aiReviewReport.requestedBy = user as any;

      await aiReviewReportRepo.save(aiReviewReport);
      console.log(`[RoundController] ✓ AIReviewReport saved with ID: ${aiReviewReport.id}`);

      // Update round with latest data
      round.aiReviewReport = aiReviewResult.summaryReport;
      round.annotatedPdfUrl = aiReviewResult.annotatedPdfUrl;

      if (complianceReport) {
        round.complianceReportsByUser = {
          ...(round.complianceReportsByUser ?? {}),
          [user.id]: {
            report: complianceReport,
            createdAt: new Date().toISOString(),
          },
        };
      }

      if (aiReviewResult.referenceVerificationReport) {
        round.referenceVerificationReport = aiReviewResult.referenceVerificationReport;
      }

      // Set checklist only if generated (first time only)
      if (aiReviewResult.checklistJson) {
        round.checklistJson = aiReviewResult.checklistJson;
        round.checklistUrl = aiReviewResult.checklistUrl;
        console.log(`[RoundController] ✓ Checklist prefilled`);
      }

      await roundRepo.save(round);
      console.log(`[RoundController] ✓ Round updated`);

      // STEP 5: Return combined results
      return res.status(200).json({
        success: true,
        message: 'AI Review, Compliance check, and Reference Verification completed successfully',
        data: {
          compliance: complianceReport ? {
            report: complianceReport,
            sourceUrl: complianceSourceUrl
          } : {
            report: null,
            message: 'No submission rules linked to this round'
          },
          aiReview: {
            summaryReport: aiReviewResult.summaryReport,
            annotatedPdfUrl: aiReviewResult.annotatedPdfUrl,
            suggestedCitations: aiReviewResult.suggestedCitations,
            checklist: aiReviewResult.checklistJson,
            checklistUrl: aiReviewResult.checklistUrl
          },
          referenceVerification: aiReviewResult.referenceVerificationReport ? {
            report: aiReviewResult.referenceVerificationReport,
            message: `${aiReviewResult.referenceVerificationReport.verifiedCount}/${aiReviewResult.referenceVerificationReport.totalReferences} references verified`
          } : {
            report: null,
            message: 'Reference verification did not complete'
          }
        }
      });
    } catch (err: any) {
      console.error('[RoundController] Error in runAIReviewWithCompliance:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
      });
    }
  }

  static async runComplianceCheckWithRules(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { id } = req.params;
      const file = req.file;

      if (!id) return res.status(400).json({ message: 'Missing round id' });
      if (!file) return res.status(400).json({ message: 'PDF file is required' });

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper', 'paper.coordinators', 'paper.authors']
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isCoordinator = round.paper.coordinators?.some(c => c.id === user.id);
      const isAuthor = round.paper.authors?.some(a => a.id === user.id);
      if (!isCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Forbidden: You are not a coordinator or author of this paper' });
      }

      // Load submission rules from the linked rule set
      if (!round.submissionRuleSetId) {
        return res.status(400).json({ message: 'This round does not have submission rules linked. Please extract rules first.' });
      }

      const ruleSetRepo = AppDataSource.getRepository(SubmissionRuleSet);
      const ruleSet = await ruleSetRepo.findOne({ where: { id: round.submissionRuleSetId } });

      if (!ruleSet) {
        return res.status(404).json({ message: 'Submission rules not found for this round' });
      }

      console.log(`[RoundController] Running compliance check for round ${id} with rules from ${ruleSet.sourceUrl}`);

      // Run compliance check
      const agentService = new ComplianceCheckAgentService();
      const fileId = await agentService.uploadPdf(file.buffer, `compliance_round_${id}.pdf`);
      const { complianceReport } = await agentService.runComplianceCheck(fileId, {
        sourceUrl: ruleSet.sourceUrl,
        rules: ruleSet.rules
      });

      // Update round with compliance results
      round.complianceReport = complianceReport;
      await roundRepo.save(round);

      return res.status(200).json({
        success: true,
        message: 'Compliance check completed successfully',
        data: {
          complianceReport,
          sourceUrl: ruleSet.sourceUrl
        }
      });
    } catch (err: any) {
      console.error('[RoundController] Error in runComplianceCheckWithRules:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
      });
    }
  }

  static runEmpiricalChecklistAnswering = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const pdfBuffer = req.file?.buffer;

      if (!pdfBuffer) {
        return res.status(400).json({ message: 'PDF file is required' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper'],
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const confirmed = round.confirmedChecklistJson;
      if (!confirmed || !Array.isArray(confirmed.selectedStandards) || confirmed.selectedStandards.length === 0) {
        return res.status(400).json({
          message: 'No confirmed checklist standards found. Please confirm the checklist selection first.',
        });
      }

      const paperId = round.paper.id;
      const standards: string[] = confirmed.selectedStandards;
      const role = 'author';

      console.log(`[RoundController] Running empirical checklist answering for paper ${paperId}, standards: ${standards.join(', ')}`);

      const result = await runChecklistAnswers(paperId, standards, role, pdfBuffer);

      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      console.error('[RoundController] Error in runEmpiricalChecklistAnswering:', err);
      return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  };

  static getEmpiricalChecklistAnswers = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: id as string },
        relations: ['paper'],
      });

      if (!round) return res.status(404).json({ message: 'Round not found' });

      const confirmed = round.confirmedChecklistJson;
      if (!confirmed || !Array.isArray(confirmed.selectedStandards) || confirmed.selectedStandards.length === 0) {
        return res.status(200).json({ success: true, data: null });
      }

      const result = await getStoredChecklistAnswers(round.paper.id, confirmed.selectedStandards, 'author');

      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      console.error('[RoundController] Error in getEmpiricalChecklistAnswers:', err);
      return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  };
}
