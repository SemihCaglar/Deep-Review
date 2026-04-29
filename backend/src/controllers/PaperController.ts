import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Paper } from '../entities/Paper';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { RoundStatus } from '../entities/Round';
import { UserRole } from '../entities/User';
import { LocalAdmin } from '../entities/LocalAdmin';
import { In } from 'typeorm';
import { PaperService } from '../services/PaperService';
import { RegisterPaperDto } from '../dtos/PaperDto';
import { AuthenticatedRequest } from '../types/auth';

/** Safely extracts a single string from a query param (which Express types as string | string[]). */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value) && typeof value[0] === 'string') return (value[0] as string).trim() || undefined;
  return undefined;
}

export class PaperController {
  static async registerPaper(req: AuthenticatedRequest, res: Response) {
    try {
      const dto = req.body as RegisterPaperDto;
      const creator = req.user;

      if (!creator) {
          return res.status(401).json({ message: 'Authentication required' });
      }

      if (!dto.title || !dto.abstractText || !dto.targetVenue || !dto.topics || !Array.isArray(dto.topics) || dto.topics.length === 0) {
          return res.status(400).json({ message: 'Missing required fields: title, abstractText, targetVenue, topics are required.' });
      }

      const paper = await PaperService.registerPaper(dto, creator);

      return res.status(201).json({
        message: 'Paper successfully saved as Draft',
        paper
      });
    } catch (e: any) {
      if (e.message && e.message.includes('invalid')) {
          return res.status(400).json({ error: e.message });
      }
      return res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }
  static async getPaperById(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.getPaperById(id);
        if (!paper) {
            return res.status(404).json({ message: 'Paper not found' });
        }
        res.status(200).json(paper);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  }
  static async setTopics(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        const { topics } = req.body;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.updateTopics(id, topics);
        res.status(200).json(paper);
    } catch (e: any) {
        if (e.message === 'Paper not found') {
            return res.status(404).json({ message: e.message });
        }
        res.status(500).json({ error: e.message });
    }
  }
  static async uploadManuscript(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async linkParentPapers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateAbstract(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        const { abstract } = req.body;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.updateAbstract(id, abstract);
        res.status(200).json(paper);
    } catch (e: any) {
        if (e.message === 'Paper not found') {
            return res.status(404).json({ message: e.message });
        }
        res.status(500).json({ error: e.message });
    }
  }
  static async updateTopics(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        const { topics } = req.body;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.updateTopics(id, topics);
        res.status(200).json(paper);
    } catch (e: any) {
        if (e.message === 'Paper not found') {
            return res.status(404).json({ message: e.message });
        }
        res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /papers/:id/status?userId=<uuid>
   *
   * Returns the current status and a snapshot of the latest round for a specific paper.
   * Access: coordinator of the paper OR any of its authors.
   */
  static async getPaperStatus(req: Request, res: Response) {
    const paperId = String(req.params.id ?? '').trim();
    const userId = queryString(req.query.userId);

    if (!paperId) return res.status(400).json({ message: 'Paper id is required' });
    if (!userId) return res.status(400).json({ message: 'userId query param is required' });

    try {
      const paper = await AppDataSource.getRepository(Paper).findOne({
        where: { id: paperId },
        relations: [
          'authors',
          'coordinator',
          'rounds',
          'rounds.assignments',
          'labs',
          'labs.coordinator',
        ],
      });

      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      // Access control: direct coordinator, lab coordinator, or author only
      const isExplicitCoordinator = paper.coordinators?.some(c => c.id === userId) ?? false;
      const isLabCoordinator = paper.labs?.some(lab => lab.coordinator?.id === userId) ?? false;
      const isAuthor = paper.authors?.some(a => a.id === userId) ?? false;
      if (!isExplicitCoordinator && !isLabCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Latest round = highest roundNumber
      const latestRound = paper.rounds
        ?.slice()
        .sort((a, b) => b.roundNumber - a.roundNumber)[0] ?? null;

      const latestRoundSummary = latestRound
        ? {
          roundNumber: latestRound.roundNumber,
          status: latestRound.status,
          deadline: latestRound.deadline,
          totalAssigned: latestRound.assignments?.length ?? 0,
          totalCompleted: latestRound.assignments?.filter(
            a => a.status === AssignmentStatus.Completed,
          ).length ?? 0,
          totalPending: latestRound.assignments?.filter(
            a => a.status === AssignmentStatus.Invited || a.status === AssignmentStatus.Accepted,
          ).length ?? 0,
        }
        : null;

      return res.status(200).json({
        id: paper.id,
        title: paper.title,
        status: paper.status,
        targetVenue: paper.targetVenue,
        latestRound: latestRoundSummary,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /papers/:id/history?userId=<uuid>
   *
   * Returns the full round-by-round review history for a specific paper.
   * Response depth: rounds + assignments (reviewer info, summary, extension, rating).
   * Excludes checklist items and AI review reports (available via dedicated endpoints).
   * Access: coordinator of the paper OR any of its authors.
   */
  static async getPaperHistory(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });

      const paperId = String(req.params.id ?? '').trim();
      const userId = authReq.user.id;

      if (!paperId) return res.status(400).json({ message: 'Paper id is required' });

      const paper = await AppDataSource.getRepository(Paper).findOne({
        where: { id: paperId },
        relations: [
          'authors',
          'coordinator',
          'rounds',
          'rounds.assignments',
          'rounds.assignments.reviewer',
          'rounds.assignments.reviewSummary',
          'rounds.assignments.extension',
          'rounds.assignments.rating',
          'labs',
          'labs.coordinator',
        ],
      });

      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isExplicitCoordinator = paper.coordinators?.some(c => c.id === userId) ?? false;
      const isLabCoordinator = paper.labs?.some(lab => lab.coordinator?.id === userId) ?? false;
      const isAuthor = paper.authors?.some(a => a.id === userId) ?? false;
      const isReviewer =
        paper.rounds?.some(r =>
          r.assignments?.some(a => a.reviewer?.id === userId)
        ) ?? false;

      const isAdmin = authReq.user.role === UserRole.GlobalAdmin || authReq.user.role === UserRole.LocalAdmin;
      const isCoordinator = authReq.user.role === UserRole.Coordinator;

      if (!isExplicitCoordinator && !isLabCoordinator && !isAuthor && !isReviewer && !isAdmin && !isCoordinator) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const rounds = (paper.rounds ?? [])
        .slice()
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map(round => ({
          roundNumber: round.roundNumber,
          roundStatus: round.status,
          deadline: round.deadline,
          startedAt: round.startedAt,
          closedAt: round.closedAt,
          assignments: (round.assignments ?? []).map(assignment => ({
            assignmentId: assignment.id,
            reviewerId: assignment.reviewer?.id ?? null,
            reviewerName: assignment.reviewer?.name ?? null,
            status: assignment.status,
            deadline: assignment.deadline,
            invitedAt: assignment.invitedAt,
            acceptedAt: assignment.acceptedAt,
            submittedAt: assignment.submittedAt,
            declineReason: assignment.declineReason,
            summary: assignment.reviewSummary
              ? {
                text: assignment.reviewSummary.text,
                submittedAt: assignment.reviewSummary.submittedAt,
              }
              : null,
            extension: assignment.extensions?.[0]
              ? {
                requestedDeadline: assignment.extensions[0].requestedDeadline,
                approvedDeadline: assignment.extensions[0].approvedDeadline,
                status: assignment.extensions[0].status,
              }
              : null,
            rating: assignment.rating
              ? {
                qualityScore: assignment.rating.qualityScore,
                quantityScore: assignment.rating.quantityScore,
                timeScore: assignment.rating.timeScore,
              }
              : null,
          })),
        }));

      return res.status(200).json({
        id: paper.id,
        title: paper.title,
        status: paper.status,
        targetVenue: paper.targetVenue,
        rounds,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }
  /**
   * GET /papers/my-written
   *
   * Returns all papers that the authenticated caller is listed as an author of.
   * Filters at the database level via the join table — does NOT load all papers into memory.
   */
  static async getMyWrittenPapers(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });

      const papers = await AppDataSource.getRepository(Paper).find({
        where: { authors: { id: authReq.user.id } },
        relations: ['authors', 'topics', 'coordinator', 'rounds'],
      });

      const result = papers.map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        targetVenue: p.targetVenue,
        creationTime: p.creationTime,
        topics: (p.topics ?? []).map(t => ({ id: t.id, name: t.name })),
        authors: (p.authors ?? []).map(a => ({ id: a.id, name: a.name })),
        coordinatorId: p.coordinators?.[0]?.id ?? null,
        latestRoundNumber: p.rounds?.length
          ? Math.max(...p.rounds.map(r => r.roundNumber))
          : null,
      }));

      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /papers/my-reviewed
   *
   * Returns all papers the authenticated caller has ever been assigned to review.
   * Each paper is returned exactly once, deduplicated by paper.id.
   * Tagged with the caller's most recent assignment status for that paper.
   */
  static async getMyReviewedPapers(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });

      const assignments = await AppDataSource.getRepository(Assignment).find({
        where: { reviewer: { id: authReq.user.id } },
        relations: ['round', 'round.paper', 'round.paper.topics', 'round.paper.authors'],
      });

      const paperMap = new Map<string, {
        paper: typeof assignments[0]['round']['paper'];
        latestAssignment: typeof assignments[0];
        totalRoundsReviewed: number;
      }>();

      for (const assignment of assignments) {
        const paper = assignment.round?.paper;
        if (!paper) continue;

        const existing = paperMap.get(paper.id);
        if (!existing) {
          paperMap.set(paper.id, {
            paper,
            latestAssignment: assignment,
            totalRoundsReviewed: 1,
          });
        } else {
          existing.totalRoundsReviewed += 1;

          if (assignment.invitedAt > existing.latestAssignment.invitedAt) {
            existing.latestAssignment = assignment;
          }
        }
      }

      const result = Array.from(paperMap.values()).map(({ paper, latestAssignment, totalRoundsReviewed }) => ({
        paperId: paper.id,
        title: paper.title,
        paperStatus: paper.status,
        targetVenue: paper.targetVenue,
        topics: (paper.topics ?? []).map(t => ({ id: t.id, name: t.name })),
        latestAssignmentStatus: latestAssignment.status,
        latestRoundNumber: latestAssignment.round?.roundNumber ?? null,
        totalRoundsReviewed,
      }));

      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /papers/my-current-reviewed
   *
   * Returns papers for which the authenticated caller has an active review assignment.
   * "Active" means: assignment.status IN [Invited, Accepted, Overdue] AND round.status = Open.
   */
  static async getMyCurrentReviewedPapers(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });

      const allActive = await AppDataSource.getRepository(Assignment).find({
        where: {
          reviewer: { id: authReq.user.id },
          status: In([
            AssignmentStatus.Invited,
            AssignmentStatus.Accepted,
            AssignmentStatus.Overdue,
          ]),
        },
        relations: ['round', 'round.paper', 'round.paper.topics'],
      });

      const currentAssignments = allActive.filter(
        a => a.round?.status === RoundStatus.Open,
      );

      const result = currentAssignments.map(a => ({
        paperId: a.round.paper?.id ?? null,
        title: a.round.paper?.title ?? null,
        paperStatus: a.round.paper?.status ?? null,
        targetVenue: a.round.paper?.targetVenue ?? null,
        topics: (a.round.paper?.topics ?? []).map(t => ({ id: t.id, name: t.name })),
        roundNumber: a.round.roundNumber,
        assignmentId: a.id,
        assignmentStatus: a.status,
        deadline: a.deadline,
        invitedAt: a.invitedAt,
        acceptedAt: a.acceptedAt,
      }));

      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }
  static async getMyCoordinatedPapers(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const paperRepo = AppDataSource.getRepository(Paper);
      const papers = await paperRepo.find({
        where: { coordinators: { id: coordinator.id } },
        relations: ['coordinators', 'labs'],
      });

      return res.status(200).json(papers.map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        targetVenue: p.targetVenue,
        abstractText: p.abstractText,
      })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getAllPapers(req: Request, res: Response) {
    try {
        const repo = AppDataSource.getRepository(Paper);
        const papers = await repo.find({ relations: ['authors', 'topics'] });
        
        const sortedPapers = papers.map(paper => {
            if (paper.authorOrder && paper.authors) {
                const orderMap = new Map(paper.authorOrder.map((id, index) => [id, index]));
                paper.authors.sort((a, b) => {
                    const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
                    const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
                    return orderA - orderB;
                });
            }
            return {
                ...paper,
                authors: paper.authors?.map(a => ({ id: a.id, name: a.name, email: a.email })) || []
            };
        });

        res.status(200).json(sortedPapers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
  static async updateAuthors(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        const { authors } = req.body;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.updateAuthors(id, authors);
        res.status(200).json(paper);
    } catch (e: any) {
        if (e.message === 'Paper not found') {
            return res.status(404).json({ message: e.message });
        }
        if (e.message && e.message.includes('invalid')) {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: e.message });
    }
  }
  static async updatePaperStatus(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
