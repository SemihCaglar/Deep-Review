import { Response } from 'express';
import { Not } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { DeclineRequestStatus } from '../entities/DeclineRequest';
import { ExtensionStatus } from '../entities/Extension';
import { Round } from '../entities/Round';
import { UserRole } from '../entities/User';
import { sendEmail } from '../services/emailService';
import type { AuthenticatedRequest } from '../types/auth';

export class AssignmentController {
  static async assignReviewers(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
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

      const isOwner = round.paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      const authorIds = new Set(round.paper.authors?.map(a => a.id) ?? []);
      const userRepo = AppDataSource.getRepository('User');
      const assignRepo = AppDataSource.getRepository(Assignment);
      const newAssignments: Assignment[] = [];

      for (const rId of reviewerIds) {
        if (authorIds.has(rId)) continue;

        const reviewer = await userRepo.findOne({ where: { id: rId } });
        if (!reviewer) continue;
        if (reviewer.role === UserRole.Coordinator || reviewer.role === UserRole.Admin) continue;

        // Skip if any active (non-Cancelled) assignment already exists for this reviewer on this round
        const activeExists = await assignRepo.findOne({
          where: {
            round: { id: roundId },
            reviewer: { id: rId },
            status: Not(AssignmentStatus.Cancelled),
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

      const assignRepo = AppDataSource.getRepository(Assignment);
      // Only send to Invited assignments that have not yet received an invitation email
      const pendingInvitations = await assignRepo.find({
        where: { round: { id: roundId }, status: AssignmentStatus.Invited, invitationSent: false },
        relations: ['reviewer'],
      });

      for (const a of pendingInvitations) {
        await sendEmail(
          a.reviewer,
          'You have been invited to review a paper',
          `Hello ${a.reviewer.name},\n\nYou have been invited to review a paper. Please log in to accept or decline.\n\nDeadline: ${a.deadline?.toISOString() ?? 'TBD'}`
        );
        a.invitationSent = true;
      }

      if (pendingInvitations.length > 0) {
        await assignRepo.save(pendingInvitations);
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
        where: { reviewer: { id: user.id } },
        relations: ['round', 'round.paper', 'declineRequests', 'extensions'],
        order: { invitedAt: 'DESC' },
      });

      const formatted = assignments.map(a => ({
        id: a.id,
        status: a.status,
        deadline: a.deadline,
        invitationSent: a.invitationSent,
        round: {
          id: a.round.id,
          roundNumber: a.round.roundNumber,
          deadline: a.round.deadline,
        },
        paper: {
          id: a.round.paper.id,
          title: a.round.paper.title,
          targetVenue: a.round.paper.targetVenue,
          abstractText: a.round.paper.abstractText,
        },
        pendingDeclineRequest: a.declineRequests?.find(d => d.status === DeclineRequestStatus.Pending) ?? null,
        pendingExtensionRequest: a.extensions?.find(e => e.status === ExtensionStatus.Pending) ?? null,
      }));

      return res.status(200).json(formatted);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async sendReminders(req: AuthenticatedRequest, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
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
        relations: ['round', 'round.paper', 'round.paper.coordinators'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

      const isOwner = assignment.round.paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      assignment.status = AssignmentStatus.Cancelled;
      await assignRepo.save(assignment);

      return res.status(200).json({ message: 'Assignment cancelled', id: assignment.id });
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

      assignment.deadline = new Date(deadline);
      await assignRepo.save(assignment);

      return res.status(200).json({ id: assignment.id, deadline: assignment.deadline });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
  static async respondToInvitation(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async requestDecline(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async requestDeadlineExtension(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async processDeclineRequest(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async processExtensionRequest(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async submitReviewSummary(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async markReviewCompleted(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
