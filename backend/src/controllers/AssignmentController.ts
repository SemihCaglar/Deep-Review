import { Response } from 'express';
import { In, Not } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { DeclineRequest, DeclineRequestStatus } from '../entities/DeclineRequest';
import { Extension, ExtensionStatus } from '../entities/Extension';
import { Round, RoundStatus } from '../entities/Round';
import { Paper, PaperStatus } from '../entities/Paper';
import { User, UserRole } from '../entities/User';
import { sendTemplatedEmail } from '../services/emailService';
import { TemplateName } from '../entities/Template';
import { CoordinatorService, CoordinatorServiceError } from '../services/CoordinatorService';
import { RoundService } from '../services/RoundService';
import type { AuthenticatedRequest } from '../types/auth';

export class AssignmentController {
  static async assignReviewers(req: AuthenticatedRequest, res: Response) {
    try {
      const requesterBase = req.user;
      if (!requesterBase) return res.status(401).json({ message: 'Authentication required' });

      // Explicitly load labs for the requester to ensure filtering works
      const userRepo = AppDataSource.getRepository<User>('User');
      const requester = await userRepo.findOne({ where: { id: requesterBase.id }, relations: ['labs'] });
      if (!requester) return res.status(401).json({ message: 'Authentication required' });

      if (requester.role !== UserRole.Coordinator && requester.role !== UserRole.Admin) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator or Admin role' });
      }

      const { roundId, reviewerIds, deadline: deadlineOverride } = req.body;
      if (!roundId || !reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0) {
        return res.status(400).json({ message: 'Missing roundId or valid reviewerIds array' });
      }
      if (deadlineOverride && isNaN(new Date(deadlineOverride).getTime())) {
        return res.status(400).json({ message: 'Invalid deadline format' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: roundId },
        relations: ['paper', 'paper.authors', 'paper.coordinators'],
      });
      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isOwner = round.paper.coordinators?.some(c => c.id === requester.id) || requester.role === UserRole.Admin;
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      const now = new Date();
      const shouldReopenCompletedRound = round.status === RoundStatus.Completed;
      if (shouldReopenCompletedRound) {
        if (!round.deadline || round.deadline.getTime() < now.getTime()) {
          return res.status(400).json({ message: 'Cannot add reviewers to a completed round after the round deadline has passed' });
        }
      }

      const authorIds = new Set(round.paper.authors?.map(a => a.id) ?? []);
      const assignRepo = AppDataSource.getRepository(Assignment);
      const newAssignments: Assignment[] = [];

      for (const rId of reviewerIds) {
        if (authorIds.has(rId)) continue;

        const reviewer = await userRepo.findOne({ where: { id: rId }, relations: ['labs'] });
        if (!reviewer) continue;
        if (reviewer.role === UserRole.Coordinator || reviewer.role === UserRole.Admin) continue;

        // Lab check:
        if (requester.role !== UserRole.Admin) {
          const reviewerLabIds = reviewer.labs?.map((l: any) => l.id) || [];
          const requesterLabIds = requester.labs?.map((l: any) => l.id) || [];
          const sharesLab = reviewerLabIds.some((id: any) => requesterLabIds.includes(id));
          if (!sharesLab) continue;
        }

        // Skip if ANY assignment already exists for this reviewer on this round
        const activeExists = await assignRepo.findOne({
          where: {
            round: { id: roundId },
            reviewer: { id: rId },
          },
        });
        if (activeExists) continue;

        const assignment = new Assignment();
        assignment.round = round;
        assignment.reviewer = reviewer as any;
        assignment.status = AssignmentStatus.Invited;
        assignment.deadline = deadlineOverride ? new Date(deadlineOverride) : round.deadline;
        assignment.invitationSent = false;
        newAssignments.push(assignment);
      }

      if (newAssignments.length === 0) {
        return res.status(200).json({ message: 'No new assignments created' });
      }

      await assignRepo.save(newAssignments);

      if (shouldReopenCompletedRound) {
        round.status = RoundStatus.Open;
        round.completedAt = null;
        await roundRepo.save(round);
      }

      if (round.paper.status !== PaperStatus.InReview) {
        const paperRepo = AppDataSource.getRepository(Paper);
        round.paper.status = PaperStatus.InReview;
        await paperRepo.save(round.paper);
      }

      return res.status(201).json(newAssignments.map(a => ({
        id: a.id,
        reviewerId: a.reviewer.id,
        status: a.status,
        deadline: a.deadline,
      })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async sendInvitations(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const { roundId } = req.body;
      if (!roundId) return res.status(400).json({ message: 'Missing roundId' });

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: roundId },
        relations: ['paper', 'paper.coordinators'],
      });
      if (!round) return res.status(404).json({ message: 'Round not found' });

      const isOwner = round.paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      if (round.status !== RoundStatus.Open) {
        return res.status(400).json({ message: `Invitations can only be sent for Open rounds — this round is currently '${round.status}'. Use 'Approve & Start Round' to open the round and send invitations automatically.` });
      }

      const assignRepo = AppDataSource.getRepository(Assignment);
      const pendingInvitations = await assignRepo.find({
        where: { round: { id: roundId }, status: AssignmentStatus.Invited, invitationSent: false },
        relations: ['reviewer', 'round', 'round.paper'],
      });

      for (const a of pendingInvitations) {
        await sendTemplatedEmail(a.reviewer, TemplateName.REVIEW_INVITATION, {
          userName: a.reviewer.name,
          paperTitle: a.round?.paper?.title ?? '',
          roundNumber: String(a.round?.roundNumber ?? ''),
          deadline: a.deadline?.toISOString().split('T')[0] ?? 'TBD',
        });
        a.invitationSent = true;
      }

      if (pendingInvitations.length > 0) {
        await assignRepo.save(pendingInvitations);
      }

      // Transition paper to In Review when first invitations are sent
      const paper = round.paper;
      if (pendingInvitations.length > 0 && paper.status !== PaperStatus.InReview) {
        const paperRepo = AppDataSource.getRepository(Paper);
        paper.status = PaperStatus.InReview;
        await paperRepo.save(paper);
      }

      return res.status(200).json({ message: `Invitations sent to ${pendingInvitations.length} reviewer(s)` });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async getMyAssignments(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignments = await assignRepo.find({
        where: {
          reviewer: { id: user.id },
          status: Not(AssignmentStatus.Cancelled),
        },
        relations: ['round', 'round.paper', 'round.paper.authors', 'declineRequests', 'extensions'],
        order: { invitedAt: 'DESC' },
      });

      const detailsVisible = [
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingDecline,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.Completed,
        AssignmentStatus.Overdue,
      ];
      const formatted = assignments.map(a => {
        const orderedAuthors = [...(a.round.paper.authors ?? [])];
        if (a.round.paper.authorOrder?.length) {
          const orderMap = new Map(a.round.paper.authorOrder.map((id, index) => [id, index]));
          orderedAuthors.sort((left, right) => {
            const leftOrder = orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER;
            return leftOrder - rightOrder;
          });
        }

        const resolvedDeclineRequests = (a.declineRequests ?? [])
          .filter(d => d.status !== DeclineRequestStatus.Pending && !d.dismissedByReviewer)
          .map(d => ({
            id: d.id,
            reason: d.reason,
            status: d.status,
            requestedAt: d.requestedAt,
          }));

        const resolvedExtensionRequests = (a.extensions ?? [])
          .filter(e => e.status !== ExtensionStatus.Pending && !e.dismissedByReviewer)
          .map(e => ({
            id: e.id,
            reason: e.reason,
            status: e.status,
            requestedDeadline: e.requestedDeadline,
            approvedDeadline: e.approvedDeadline,
            requestedAt: e.requestedAt,
          }));

        return {
          id: a.id,
          status: a.status,
          deadline: a.deadline,
          invitationSent: a.invitationSent,
          round: {
            id: a.round.id,
            roundNumber: a.round.roundNumber,
            deadline: a.round.deadline,
            submissionDeadline: a.round.submissionDeadline ?? null,
            targetVenue: a.round.targetVenue,
            venueCategory: a.round.venueCategory,
          },
          paper: {
            id: a.round.paper.id,
            title: a.round.paper.title,
            abstractText: a.round.paper.abstractText,
            overleafLink: detailsVisible.includes(a.status) ? (a.round.paper.overleafLink ?? null) : null,

            authors: orderedAuthors.map(author => ({
              id: author.id,
              name: author.name,
              email: author.email,
            })),
          },
          pendingDeclineRequest: a.declineRequests?.find(d => d.status === DeclineRequestStatus.Pending) ?? null,
          pendingExtensionRequest: a.extensions?.find(e => e.status === ExtensionStatus.Pending) ?? null,
          resolvedDeclineRequests,
          resolvedExtensionRequests,
        };
      });

      return res.status(200).json(formatted);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async dismissRequestDecisions(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const declineRequestIds = Array.isArray(req.body?.declineRequestIds)
        ? req.body.declineRequestIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];
      const extensionRequestIds = Array.isArray(req.body?.extensionRequestIds)
        ? req.body.extensionRequestIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];

      if (declineRequestIds.length === 0 && extensionRequestIds.length === 0) {
        return res.status(400).json({ message: 'No request decisions selected' });
      }

      const declineRepo = AppDataSource.getRepository(DeclineRequest);
      const extensionRepo = AppDataSource.getRepository(Extension);
      let dismissedCount = 0;

      if (declineRequestIds.length > 0) {
        const declineRequests = await declineRepo.find({
          where: { id: In(declineRequestIds), assignment: { reviewer: { id: user.id } } },
          relations: ['assignment', 'assignment.reviewer'],
        });

        const resolvedDeclines = declineRequests.filter(request => request.status !== DeclineRequestStatus.Pending);
        for (const request of resolvedDeclines) {
          request.dismissedByReviewer = true;
        }
        if (resolvedDeclines.length > 0) {
          await declineRepo.save(resolvedDeclines);
          dismissedCount += resolvedDeclines.length;
        }
      }

      if (extensionRequestIds.length > 0) {
        const extensionRequests = await extensionRepo.find({
          where: { id: In(extensionRequestIds), assignment: { reviewer: { id: user.id } } },
          relations: ['assignment', 'assignment.reviewer'],
        });

        const resolvedExtensions = extensionRequests.filter(request => request.status !== ExtensionStatus.Pending);
        for (const request of resolvedExtensions) {
          request.dismissedByReviewer = true;
        }
        if (resolvedExtensions.length > 0) {
          await extensionRepo.save(resolvedExtensions);
          dismissedCount += resolvedExtensions.length;
        }
      }

      return res.status(200).json({ message: `${dismissedCount} request decision(s) removed from dashboard`, dismissedCount });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async reassignReviewer(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const oldAssignmentId = req.params.id as string;
      const { newReviewerId } = req.body;

      if (!newReviewerId) {
        return res.status(400).json({ message: 'Missing newReviewerId' });
      }

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id: oldAssignmentId },
        relations: ['round', 'round.paper', 'round.paper.labs'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

      const labId = assignment.round.paper.labs?.[0]?.id;
      if (!labId) {
        return res.status(400).json({ message: 'Paper has no lab associated' });
      }

      const newAssignment = await CoordinatorService.reassignReviewer(
        oldAssignmentId,
        newReviewerId,
        { coordinatorId: coordinator.id, labId },
      );

      // Send the invite email immediately (reassign = cancel + re-invite atomically)
      if (newAssignment.reviewer) {
        await sendTemplatedEmail(newAssignment.reviewer, TemplateName.REVIEW_INVITATION, {
          userName: newAssignment.reviewer.name,
          paperTitle: (newAssignment as any).round?.paper?.title ?? '',
          roundNumber: String((newAssignment as any).round?.roundNumber ?? ''),
          deadline: newAssignment.deadline?.toISOString().split('T')[0] ?? 'TBD',
        });
        const assignRepo = AppDataSource.getRepository(Assignment);
        await assignRepo.update(newAssignment.id, { invitationSent: true });
        newAssignment.invitationSent = true;
      }

      return res.status(201).json(newAssignment);
    } catch (err) {
      if (err instanceof CoordinatorServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async sendReminders(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const { assignmentIds } = req.body;
      if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
        return res.status(400).json({ message: 'assignmentIds must be a non-empty array' });
      }

      const activeStatuses = new Set([
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.PendingDecline,
      ]);

      const assignRepo = AppDataSource.getRepository(Assignment);
      let sent = 0;
      let skipped = 0;

      const assignments = await assignRepo.find({
        where: { id: In(assignmentIds) },
        relations: ['reviewer', 'round', 'round.paper', 'round.paper.coordinators'],
      });

      const foundIds = new Set(assignments.map(a => a.id));
      skipped += assignmentIds.filter(id => !foundIds.has(id)).length;

      for (const assignment of assignments) {
        const isOwner = assignment.round.paper.coordinators?.some(c => c.id === coordinator.id);
        if (!isOwner || !activeStatuses.has(assignment.status)) { skipped++; continue; }

        const paperTitle = assignment.round.paper.title;
        const deadline = assignment.deadline?.toISOString().split('T')[0] ?? 'N/A';

        try {
          await sendTemplatedEmail(assignment.reviewer, TemplateName.REVIEW_REMINDER, {
            userName: assignment.reviewer.name,
            paperTitle,
            roundNumber: String(assignment.round.roundNumber),
            deadline,
          });
          assignment.reminderSentAt = new Date();
          await assignRepo.save(assignment);
          sent++;
        } catch {
          skipped++;
        }
      }

      return res.status(200).json({ message: `Reminders sent`, sent, skipped });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async sendPaperReminders(req: AuthenticatedRequest, res: Response) {
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
        return res.status(403).json({ message: 'Forbidden: Only coordinators or authors of this paper can send reminders' });
      }

      const activeStatuses = new Set([
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.PendingDecline,
      ]);

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignments = await assignRepo.find({
        where: { round: { paper: { id: paperId } }, status: In([...activeStatuses]) },
        relations: ['reviewer', 'round', 'round.paper'],
      });

      let sent = 0;
      let skipped = 0;

      for (const assignment of assignments) {
        const paperTitle = assignment.round.paper.title;
        const deadline = assignment.deadline?.toISOString().split('T')[0] ?? 'N/A';
        try {
          await sendTemplatedEmail(assignment.reviewer, TemplateName.REVIEW_REMINDER, {
            userName: assignment.reviewer.name,
            paperTitle,
            roundNumber: String(assignment.round.roundNumber),
            deadline,
          });
          assignment.reminderSentAt = new Date();
          await assignRepo.save(assignment);
          sent++;
        } catch {
          skipped++;
        }
      }

      return res.status(200).json({ message: `Reminders sent`, sent, skipped });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async cancelAssignment(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const id = req.params.id as string;
      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id },
        relations: ['reviewer', 'round', 'round.paper', 'round.paper.coordinators', 'declineRequests', 'extensions'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

      const isOwner = assignment.round.paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      const cancellableStatuses = [
        AssignmentStatus.Invited,
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingDecline,
        AssignmentStatus.PendingExtension,
      ];
      if (!cancellableStatuses.includes(assignment.status)) {
        return res.status(400).json({ message: `Cannot cancel assignment: it is currently '${assignment.status}'. Only active assignments (Invited, Accepted, PendingDecline, PendingExtension) can be cancelled.` });
      }

      assignment.status = AssignmentStatus.Cancelled;
      const declinedRequestsToSave = assignment.declineRequests?.filter(request => request.status === DeclineRequestStatus.Pending) ?? [];
      declinedRequestsToSave.forEach(request => {
        if (request.status === DeclineRequestStatus.Pending) {
          request.status = DeclineRequestStatus.Rejected;
        }
      });
      const extensionsToSave = assignment.extensions?.filter(request => request.status === ExtensionStatus.Pending) ?? [];
      extensionsToSave.forEach(request => {
        if (request.status === ExtensionStatus.Pending) {
          request.status = ExtensionStatus.Rejected;
        }
      });
      await assignRepo.save(assignment);
      if (declinedRequestsToSave.length > 0) {
        await AppDataSource.getRepository(DeclineRequest).save(declinedRequestsToSave);
      }
      if (extensionsToSave.length > 0) {
        await AppDataSource.getRepository(Extension).save(extensionsToSave);
      }
      await RoundService.completeRoundIfAllAssignmentsTerminal(assignment.round.id);

      sendTemplatedEmail(assignment.reviewer, TemplateName.ASSIGNMENT_CANCELLED, {
        userName: assignment.reviewer.name,
        paperTitle: assignment.round.paper.title,
        roundNumber: String(assignment.round.roundNumber),
      }).catch(console.error);

      return res.status(200).json({
        message: 'Assignment cancelled',
        id: assignment.id,
        roundId: assignment.round.id,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async updateAssignmentDeadline(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const id = req.params.id as string;
      const { deadline } = req.body;
      if (!deadline) return res.status(400).json({ message: 'Missing deadline' });
      if (isNaN(new Date(deadline).getTime())) return res.status(400).json({ message: 'Invalid deadline format' });

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id },
        relations: ['round', 'round.paper', 'round.paper.coordinators'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

      const isOwner = assignment.round.paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      if (assignment.status === AssignmentStatus.Overdue) {
        return res.status(400).json({ message: 'Cannot update deadline for an overdue assignment' });
      }

      const newDeadline = new Date(deadline);
      const round = assignment.round;
      const ceiling = round.venueCategory === 'Conference' && round.submissionDeadline
        ? round.submissionDeadline
        : round.deadline;

      if (ceiling && newDeadline.getTime() > ceiling.getTime()) {
        const label = round.venueCategory === 'Conference' ? 'the conference submission deadline' : 'the round deadline';
        const cap = ceiling.toISOString().split('T')[0];
        return res.status(400).json({ message: `Assignment deadline cannot exceed ${label} (${cap}).` });
      }

      assignment.deadline = newDeadline;
      await assignRepo.save(assignment);

      return res.status(200).json({ id: assignment.id, deadline: assignment.deadline });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}
