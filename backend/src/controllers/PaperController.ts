import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Paper, PaperStatus } from '../entities/Paper';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { RoundStatus } from '../entities/Round';
import { UserRole } from '../entities/User';
import { In } from 'typeorm';
import { PaperService } from '../services/PaperService';
import { RegisterPaperDto } from '../dtos/PaperDto';
import { AuthenticatedRequest } from '../types/auth';
import { Coordinator } from '../entities/Coordinator';

/** Safely extracts a single string from a query param (which Express types as string | string[]). */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value) && typeof value[0] === 'string') return (value[0] as string).trim() || undefined;
  return undefined;
}

type PaperAuthorResponse = {
  id: string;
  name: string;
  email: string;
};

function getOrderedPaperAuthors(paper: Paper): PaperAuthorResponse[] {
  const byId = new Map<string, PaperAuthorResponse>();

  for (const author of paper.authors ?? []) {
    byId.set(author.id, {
      id: author.id,
      name: author.name,
      email: author.email,
    });
  }

  for (const coordinator of paper.coordinators ?? []) {
    if (!byId.has(coordinator.id)) {
      byId.set(coordinator.id, {
        id: coordinator.id,
        name: coordinator.name,
        email: coordinator.email,
      });
    }
  }

  const authors = Array.from(byId.values());
  if (!paper.authorOrder?.length) return authors;

  const orderMap = new Map(paper.authorOrder.map((id, index) => [id, index]));
  return authors.sort((a, b) => {
    const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}

export class PaperController {
  static async registerPaper(req: AuthenticatedRequest, res: Response) {
    try {
      const dto = req.body as RegisterPaperDto;
      const creator = req.user;

      if (!creator) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (!dto.title || !dto.abstractText || !dto.overleafLink) {
        return res.status(400).json({ message: 'Missing required fields (title, abstractText, overleafLink)' });
      }

      const normalizedOverleafLink = dto.overleafLink.trim();
      if (!/^https?:\/\/([a-z0-9-]+\.)*overleaf\.com\//i.test(normalizedOverleafLink)) {
        return res.status(400).json({ message: 'Overleaf link must be a valid Overleaf URL (e.g. https://www.overleaf.com/...)' });
      }
      dto.overleafLink = normalizedOverleafLink;

      const paper = await PaperService.registerPaper(dto, creator);

      return res.status(201).json({
        message: 'Paper successfully saved as Draft',
        paper
      });
    } catch (e: any) {
      if (e.message && (e.message.includes('invalid') || e.message.includes('Selected lab'))) {
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
  static async updateAbstract(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const id = req.params.id as string;
      const { abstract } = req.body;
      if (!id) return res.status(400).json({ message: 'Missing paper ID' });

      const paperRepo = AppDataSource.getRepository(Paper);
      const paper = await paperRepo.findOne({ where: { id }, relations: ['coordinators', 'authors'] });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const canEdit = paper.coordinators?.some(c => c.id === user.id)
        || paper.authors?.some(a => a.id === user.id);
      if (!canEdit) return res.status(403).json({ message: 'Forbidden: You are not an author or coordinator of this paper' });

      const updated = await PaperService.updateAbstract(id, abstract);
      res.status(200).json(updated);
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
        latestRound: latestRoundSummary,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /papers/:id/history
   *
   * Returns the full round-by-round review history for a specific paper.
   * Response depth: rounds + assignments, plus optional review artifacts.
   * Excludes reviewer ratings and review summaries from the author-facing history.
   * Access: coordinators can view every paper; lab members can view papers they authored.
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
          'coordinators',
          'rounds',
          'rounds.assignments',
          'rounds.assignments.reviewer',
          'rounds.assignments.extensions',
          'rounds.assignments.declineRequests',
          'rounds.assignments.rating',
          'rounds.checklistItems',
          'rounds.aiReviewReports',
          'rounds.aiReviewReports.requestedBy',
          'labs',
          'labs.coordinator',
        ],
      });

      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isAuthor = paper.authors?.some(a => a.id === userId) ?? false;
      const isAdmin = authReq.user.role === UserRole.Admin;
      const isCoordinator = authReq.user.role === UserRole.Coordinator;

      if (!isCoordinator && !isAuthor && !isAdmin) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const latestRound = (paper.rounds ?? [])
        .slice()
        .sort((a, b) => b.roundNumber - a.roundNumber)[0] ?? null;

      const rounds = (paper.rounds ?? [])
        .slice()
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map(round => ({
          id: round.id,
          roundNumber: round.roundNumber,
          roundStatus: round.status,
          deadline: round.deadline,
          startedAt: round.startedAt,
          completedAt: round.completedAt,
          assignments: (round.assignments ?? [])
            .slice()
            .sort((a, b) => a.invitedAt.getTime() - b.invitedAt.getTime())
            .map(assignment => ({
            assignmentId: assignment.id,
            reviewerId: assignment.reviewer?.id ?? null,
            reviewerName: assignment.reviewer?.name ?? null,
            reviewerEmail: assignment.reviewer?.email ?? null,
            status: assignment.status,
            deadline: assignment.deadline,
            invitedAt: assignment.invitedAt,
            acceptedAt: assignment.acceptedAt,
            submittedAt: assignment.submittedAt,
            declineReason: assignment.declineReason,
            hasRating: !!assignment.rating,
            declineRequests: (assignment.declineRequests ?? [])
              .slice()
              .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
              .map(request => ({
                id: request.id,
                reason: request.reason,
                status: request.status,
                requestedAt: request.requestedAt,
              })),
            extensions: (assignment.extensions ?? [])
              .slice()
              .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
              .map(extension => ({
                id: extension.id,
                reason: extension.reason,
                requestedDeadline: extension.requestedDeadline,
                approvedDeadline: extension.approvedDeadline,
                requestedAt: extension.requestedAt,
                status: extension.status,
              })),
          })),
          aiReviewReport: round.aiReviewReport,
          complianceReport: round.complianceReportsByUser?.[userId]?.report ?? (round.complianceReportsByUser ? null : round.complianceReport),
          annotatedPdfUrl: round.annotatedPdfUrl,
          artifacts: {
            checklistItems: (round.checklistItems ?? []).map(item => ({
              id: item.id,
              description: item.description,
              isChecked: item.isChecked,
            })),
            aiReviewReports: (round.aiReviewReports ?? [])
              .filter(report => !report.requestedBy || report.requestedBy.id === userId)
              .map(report => ({
                id: report.id,
                reviewText: report.reviewText,
                annotatedPdfUrl: report.annotatedPdfUrl,
                venue: report.venue,
                createdAt: report.createdAt,
              })),
          },
        }));

      return res.status(200).json({
        id: paper.id,
        title: paper.title,
        status: paper.status,
        targetVenue: latestRound?.targetVenue ?? '',
        overleafLink: paper.overleafLink,
        authors: (paper.authors ?? []).map(author => ({
          id: author.id,
          name: author.name,
          email: author.email,
        })),
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

      const paperRepo = AppDataSource.getRepository(Paper);
      const authoredPaperIds = await paperRepo
        .createQueryBuilder('paper')
        .innerJoin('paper.authors', 'author', 'author.id = :userId', { userId: authReq.user.id })
        .select('paper.id', 'id')
        .getRawMany<{ id: string }>();

      if (authoredPaperIds.length === 0) return res.status(200).json([]);

      const papers = await paperRepo.find({
        where: { id: In(authoredPaperIds.map(p => p.id)) },
        relations: ['authors', 'topics', 'coordinators', 'labs', 'rounds', 'rounds.assignments'],
      });

      const result = papers.map(p => {
        const latestRound = p.rounds?.length
          ? p.rounds.slice().sort((a, b) => b.roundNumber - a.roundNumber)[0]
          : null;

        return {
          id: p.id,
          title: p.title,
          status: p.status,
          targetVenue: latestRound?.targetVenue ?? '',
          abstractText: p.abstractText,
          overleafLink: p.overleafLink,
          creationTime: p.creationTime,
          topics: (p.topics ?? []).map(t => ({ id: t.id, name: t.name })),
          authors: getOrderedPaperAuthors(p),
          coordinators: (p.coordinators ?? []).map(c => ({ id: c.id, name: c.name, email: c.email })),
          labs: (p.labs ?? []).map(l => ({ id: l.id, name: l.name })),
          coordinatorId: p.coordinators?.[0]?.id ?? null,
          latestRoundNumber: latestRound?.roundNumber ?? null,
          latestRoundStatus: latestRound?.status ?? null,
          latestRoundDeadline: latestRound?.deadline ?? null,
          completedAssignments: (p.rounds ?? []).reduce(
            (count, round) => count + (round.assignments ?? []).filter(a => a.status === AssignmentStatus.Completed).length,
            0,
          ),
          totalAssignments: (p.rounds ?? []).reduce(
            (count, round) => count + (round.assignments ?? []).length,
            0,
          ),
        };
      });

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
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const paperRepo = AppDataSource.getRepository(Paper);
      const papers = await paperRepo.find({
        where: { coordinators: { id: user.id } },
        relations: ['coordinators', 'labs'],
      });

      return res.status(200).json(papers.map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        abstractText: p.abstractText,
        overleafLink: p.overleafLink ?? null,
      })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async updateOverleafLink(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const id = req.params.id as string;
      const { overleafLink } = req.body;
      if (typeof overleafLink !== 'string') {
        return res.status(400).json({ message: 'overleafLink must be a string' });
      }

      const paperRepo = AppDataSource.getRepository(Paper);
      const paper = await paperRepo.findOne({
        where: { id },
        relations: ['coordinators', 'authors'],
      });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const canEdit = paper.coordinators?.some(c => c.id === user.id)
        || paper.authors?.some(a => a.id === user.id);
      if (!canEdit) return res.status(403).json({ message: 'Forbidden: You are not an author or coordinator of this paper' });

      const normalizedOverleafLink = overleafLink.trim();
      if (!normalizedOverleafLink) {
        return res.status(400).json({ message: 'Overleaf link is mandatory' });
      }
      if (!/^https?:\/\/([a-z0-9-]+\.)*overleaf\.com\//i.test(normalizedOverleafLink)) {
        return res.status(400).json({ message: 'Overleaf link must be a valid Overleaf URL (e.g. https://www.overleaf.com/...)' });
      }
      paper.overleafLink = normalizedOverleafLink;
      await paperRepo.save(paper);

      return res.status(200).json({
        message: 'Paper link updated',
        overleafLink: paper.overleafLink ?? null,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }


  static async getAllPapers(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });

      const repo = AppDataSource.getRepository(Paper);
      let papers: Paper[];

      if (authReq.user.role === UserRole.Admin) {
        // Admins can see everything
        papers = await repo.find({ relations: ['authors', 'coordinators', 'topics'] });
      } else if (authReq.user.role === UserRole.Coordinator) {
        // Coordinators can see papers in their own lab
        const coordinatorRepo = AppDataSource.getRepository(Coordinator);
        const coordinator = await coordinatorRepo.findOne({
          where: { id: authReq.user.id },
          relations: ['lab']
        });
        
        if (!coordinator?.lab) return res.status(200).json([]);
        
        papers = await repo.find({
          where: [
            { labs: { id: coordinator.lab.id } },
            { coordinators: { id: authReq.user.id } },
          ],
          relations: ['authors', 'coordinators', 'topics', 'labs']
        });
      } else {
        return res.status(403).json({ message: 'Access denied' });
      }

      const sortedPapers = papers.map(paper => {
        return {
          ...paper,
          authors: getOrderedPaperAuthors(paper),
          coordinators: paper.coordinators?.map(c => ({ id: c.id, name: c.name, email: c.email })) || []
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
  static async updatePaperStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const id = req.params.id as string;
      const { status } = req.body;
      if (!id) return res.status(400).json({ message: 'Missing paper ID' });
      if (!Object.values(PaperStatus).includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${Object.values(PaperStatus).join(', ')}` });
      }

      const paperRepo = AppDataSource.getRepository(Paper);
      const paper = await paperRepo.findOne({
        where: { id },
        relations: ['authors', 'coordinators', 'topics', 'labs', 'rounds'],
      });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const canEdit = paper.authors?.some(a => a.id === user.id)
        || paper.coordinators?.some(c => c.id === user.id);
      if (!canEdit) {
        return res.status(403).json({ message: 'Forbidden: You are not an author or coordinator of this paper' });
      }

      if (status === PaperStatus.Archived) {
        const now = new Date();
        const roundsWithSubmissionDeadline = (paper.rounds ?? []).filter(round => !!round.submissionDeadline);
        if (roundsWithSubmissionDeadline.length === 0) {
          return res.status(400).json({ message: 'Paper cannot be archived because no submission deadline is set' });
        }

        const futureSubmission = roundsWithSubmissionDeadline.find(round =>
          round.submissionDeadline && round.submissionDeadline.getTime() > now.getTime()
        );
        if (futureSubmission) {
          return res.status(400).json({ message: 'Paper cannot be archived before the submission deadline has passed' });
        }

        const activeRound = (paper.rounds ?? []).find(round => round.status === RoundStatus.Draft || round.status === RoundStatus.Open);
        if (activeRound) {
          return res.status(400).json({ message: 'Paper cannot be archived while a review round is draft or open' });
        }
      }

      paper.status = status;
      await paperRepo.save(paper);

      const updated = await PaperService.getPaperById(id);
      return res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}
