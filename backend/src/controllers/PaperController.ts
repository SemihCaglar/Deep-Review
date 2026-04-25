import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Paper } from '../entities/Paper';
<<<<<<< HEAD
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { RoundStatus } from '../entities/Round';

/** Safely extracts a single string from a query param (which Express types as string | string[]). */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value) && typeof value[0] === 'string') return (value[0] as string).trim() || undefined;
  return undefined;
}
=======
import { UserRole } from '../entities/User';
import type { AuthenticatedRequest } from '../types/auth';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { In } from 'typeorm';
>>>>>>> issue-41

export class PaperController {
  static async registerPaper(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async setTopics(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async uploadManuscript(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async linkParentPapers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateAbstract(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateTopics(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }

  /**
   * GET /papers/:id/status?userId=<uuid>
   *
   * Returns the current status and a snapshot of the latest round for a specific paper.
   * Access: coordinator of the paper OR any of its authors.
   */
  static async getPaperStatus(req: Request, res: Response) {
    const paperId = String(req.params.id ?? '').trim();
    const userId  = queryString(req.query.userId);

    if (!paperId) return res.status(400).json({ message: 'Paper id is required' });
    if (!userId)  return res.status(400).json({ message: 'userId query param is required' });

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
      const isExplicitCoordinator = paper.coordinator?.id === userId;
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
            roundNumber:    latestRound.roundNumber,
            status:         latestRound.status,
            deadline:       latestRound.deadline,
            totalAssigned:  latestRound.assignments?.length ?? 0,
            totalCompleted: latestRound.assignments?.filter(
              a => a.status === AssignmentStatus.Completed,
            ).length ?? 0,
            totalPending:   latestRound.assignments?.filter(
              a => a.status === AssignmentStatus.Invited || a.status === AssignmentStatus.Accepted,
            ).length ?? 0,
          }
        : null;

      return res.status(200).json({
        id:          paper.id,
        title:       paper.title,
        status:      paper.status,
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
<<<<<<< HEAD
    const paperId = String(req.params.id ?? '').trim();
    const userId  = queryString(req.query.userId);

    if (!paperId) return res.status(400).json({ message: 'Paper id is required' });
    if (!userId)  return res.status(400).json({ message: 'userId query param is required' });

    try {
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

      // Access control: direct coordinator, lab coordinator, or author only
      const isExplicitCoordinator = paper.coordinator?.id === userId;
      const isLabCoordinator = paper.labs?.some(lab => lab.coordinator?.id === userId) ?? false;
      const isAuthor = paper.authors?.some(a => a.id === userId) ?? false;
      if (!isExplicitCoordinator && !isLabCoordinator && !isAuthor) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const rounds = (paper.rounds ?? [])
        .slice()
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map(round => ({
          roundNumber: round.roundNumber,
          roundStatus: round.status,
          deadline:    round.deadline,
          startedAt:   round.startedAt,
          closedAt:    round.closedAt,
          assignments: (round.assignments ?? []).map(assignment => ({
            assignmentId: assignment.id,
            reviewerId:   assignment.reviewer?.id   ?? null,
            reviewerName: assignment.reviewer?.name ?? null,
            status:       assignment.status,
            deadline:     assignment.deadline,
            invitedAt:    assignment.invitedAt,
            acceptedAt:   assignment.acceptedAt,
            submittedAt:  assignment.submittedAt,
            declineReason: assignment.declineReason,
            summary: assignment.reviewSummary
              ? {
                  text:        assignment.reviewSummary.text,
                  submittedAt: assignment.reviewSummary.submittedAt,
                }
              : null,
            extension: assignment.extension
              ? {
                  requestedDeadline: assignment.extension.requestedDeadline,
                  approvedDeadline:  assignment.extension.approvedDeadline,
                  status:            assignment.extension.status,
                }
              : null,
            rating: assignment.rating
              ? {
                  qualityScore:  assignment.rating.qualityScore,
                  quantityScore: assignment.rating.quantityScore,
                  timeScore:     assignment.rating.timeScore,
                }
              : null,
          })),
        }));

      return res.status(200).json({
        id:          paper.id,
        title:       paper.title,
        status:      paper.status,
        targetVenue: paper.targetVenue,
        rounds,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
=======
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });
      const paperId = req.params.id as string;
      const repo = AppDataSource.getRepository(Paper);
      const paper = await repo.findOne({ 
        where: { id: paperId },
        relations: ['authors', 'rounds', 'rounds.assignments', 'rounds.assignments.reviewer']
      });

      if (!paper) {
        return res.status(404).json({ message: 'Paper not found' });
      }

      // Check authorization (author, assigned reviewer, or admin/coordinator)
      const isAuthor = paper.authors.some(a => a.id === authReq.user!.id);
      const isReviewer = paper.rounds.some(r => r.assignments.some(a => a.reviewer.id === authReq.user!.id));
      if (!isAuthor && !isReviewer && authReq.user!.role !== UserRole.Coordinator && authReq.user!.role !== UserRole.Admin) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      res.status(200).json(paper);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
>>>>>>> issue-41
    }
  }

  /**
   * GET /papers/my-written?userId=<uuid>
   *
   * Returns all papers that the caller is listed as an author of.
   * Filters at the database level via the join table — does NOT load all papers into memory.
   */
  static async getMyWrittenPapers(req: Request, res: Response) {
<<<<<<< HEAD
    const userId = queryString(req.query.userId);
    if (!userId) return res.status(400).json({ message: 'userId query param is required' });

    try {
      // TypeORM translates this into a JOIN on the join table + WHERE userId = ?
      const papers = await AppDataSource.getRepository(Paper).find({
        where: { authors: { id: userId } },
        relations: ['authors', 'topics', 'coordinator', 'rounds'],
      });

      const result = papers.map(p => ({
        id:             p.id,
        title:          p.title,
        status:         p.status,
        targetVenue:    p.targetVenue,
        creationTime:   p.creationTime,
        topics:         (p.topics ?? []).map(t => ({ id: t.id, name: t.name })),
        authors:        (p.authors ?? []).map(a => ({ id: a.id, name: a.name })),
        coordinatorId:  p.coordinator?.id ?? null,
        latestRoundNumber: p.rounds?.length
          ? Math.max(...p.rounds.map(r => r.roundNumber))
          : null,
      }));

      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
=======
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });
      const repo = AppDataSource.getRepository(Paper);
      const papers = await repo.find({
        where: {
          authors: { id: authReq.user.id }
        },
        relations: ['authors', 'topics']
      });
      res.status(200).json(papers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
>>>>>>> issue-41
    }
  }

  /**
   * GET /papers/my-reviewed?userId=<uuid>
   *
   * Returns all papers the caller has ever been assigned to review (any status, any round).
   * Each paper is returned exactly once (deduplicated by paper.id).
   * Tagged with the caller's most recent assignment status for that paper.
   */
  static async getMyReviewedPapers(req: Request, res: Response) {
<<<<<<< HEAD
    const userId = queryString(req.query.userId);
    if (!userId) return res.status(400).json({ message: 'userId query param is required' });

    try {
      // Query assignments for this reviewer directly — database-level filter
      const assignments = await AppDataSource.getRepository(Assignment).find({
        where: { reviewer: { id: userId } },
        relations: ['round', 'round.paper', 'round.paper.topics', 'round.paper.authors'],
      });

      // Deduplicate by paper.id; track most recent assignment per paper
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
          // Keep the assignment with the latest invitedAt as "most recent"
          if (assignment.invitedAt > existing.latestAssignment.invitedAt) {
            existing.latestAssignment = assignment;
          }
        }
      }

      const result = Array.from(paperMap.values()).map(({ paper, latestAssignment, totalRoundsReviewed }) => ({
        paperId:              paper.id,
        title:                paper.title,
        paperStatus:          paper.status,
        targetVenue:          paper.targetVenue,
        topics:               (paper.topics ?? []).map(t => ({ id: t.id, name: t.name })),
        latestAssignmentStatus: latestAssignment.status,
        latestRoundNumber:    latestAssignment.round?.roundNumber ?? null,
        totalRoundsReviewed,
      }));

      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
=======
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });
      const repo = AppDataSource.getRepository(Assignment);
      const assignments = await repo.find({
        where: {
          reviewer: { id: authReq.user.id },
          status: AssignmentStatus.Completed
        },
        relations: ['round', 'round.paper', 'round.paper.authors']
      });
      
      const papers = assignments.map(a => a.round.paper).filter(p => !!p);
      const uniquePapers = Array.from(new Map(papers.map(p => [p.id, p])).values());
      
      res.status(200).json(uniquePapers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
>>>>>>> issue-41
    }
  }

  /**
   * GET /papers/my-current-reviewed?userId=<uuid>
   *
   * Returns papers for which the caller has an active review assignment.
   * "Active" means: assignment.status IN [Invited, Accepted, Overdue] AND round.status = Open.
   */
  static async getMyCurrentReviewedPapers(req: Request, res: Response) {
<<<<<<< HEAD
    const userId = queryString(req.query.userId);
    if (!userId) return res.status(400).json({ message: 'userId query param is required' });

    try {
      // Fetch all non-terminal assignments for this reviewer in one DB query
      const allActive = await AppDataSource.getRepository(Assignment).find({
        where: [
          { reviewer: { id: userId }, status: AssignmentStatus.Invited },
          { reviewer: { id: userId }, status: AssignmentStatus.Accepted },
          { reviewer: { id: userId }, status: AssignmentStatus.Overdue },
        ],
        relations: ['round', 'round.paper', 'round.paper.topics'],
      });

      // Secondary filter: round must be Open
      const currentAssignments = allActive.filter(
        a => a.round?.status === RoundStatus.Open,
      );

      const result = currentAssignments.map(a => ({
        paperId:          a.round.paper?.id          ?? null,
        title:            a.round.paper?.title       ?? null,
        paperStatus:      a.round.paper?.status      ?? null,
        targetVenue:      a.round.paper?.targetVenue ?? null,
        topics:           (a.round.paper?.topics ?? []).map(t => ({ id: t.id, name: t.name })),
        roundNumber:      a.round.roundNumber,
        assignmentId:     a.id,
        assignmentStatus: a.status,
        deadline:         a.deadline,
        invitedAt:        a.invitedAt,
        acceptedAt:       a.acceptedAt,
      }));

      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
=======
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });
      const repo = AppDataSource.getRepository(Assignment);
      const assignments = await repo.find({
        where: {
          reviewer: { id: authReq.user.id },
          status: In([AssignmentStatus.Invited, AssignmentStatus.Accepted, AssignmentStatus.Overdue])
        },
        relations: ['round', 'round.paper', 'round.paper.authors']
      });
      
      const papers = assignments.map(a => a.round.paper).filter(p => !!p);
      const uniquePapers = Array.from(new Map(papers.map(p => [p.id, p])).values());
      
      res.status(200).json(uniquePapers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
>>>>>>> issue-41
    }
  }

  static async getAllPapers(req: Request, res: Response) {
    try {
        const repo = AppDataSource.getRepository(Paper);
        const papers = await repo.find({ relations: ['authors'] });
        const mapMockShape = papers.map(p => ({ ...p, authors: p.authors ? p.authors.map(a => a.id) : [] }));
        res.status(200).json(mapMockShape);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  }
  static async updatePaperStatus(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
