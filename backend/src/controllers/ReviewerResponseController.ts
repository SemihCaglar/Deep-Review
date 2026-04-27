import { Response } from 'express';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { DeclineRequest, DeclineRequestStatus } from '../entities/DeclineRequest';
import { Extension, ExtensionStatus } from '../entities/Extension';
import { Summary } from '../entities/Summary';
import { UserRole } from '../entities/User';
import { sendEmail } from '../services/emailService';
import type { AuthenticatedRequest } from '../types/auth';

export class ReviewerResponseController {
  static async respondToInvitation(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { assignmentId, response, reason } = req.body;
      if (!assignmentId || !response) {
        return res.status(400).json({ message: 'Missing assignmentId or response' });
      }
      if (response !== 'accept' && response !== 'decline') {
        return res.status(400).json({ message: 'response must be "accept" or "decline"' });
      }

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id: assignmentId },
        relations: ['reviewer'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

      if (assignment.reviewer.id !== user.id) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }
      if (assignment.status !== AssignmentStatus.Invited) {
        return res.status(400).json({ message: 'Assignment is not in Invited status' });
      }

      if (response === 'accept') {
        assignment.status = AssignmentStatus.Accepted;
        assignment.acceptedAt = new Date();
        await assignRepo.save(assignment);
        return res.status(200).json({ message: 'Invitation accepted', id: assignment.id, status: assignment.status });
      }

      // decline — requires a reason, creates a pending DeclineRequest awaiting coordinator approval
      if (!reason) return res.status(400).json({ message: 'reason is required when declining' });

      const declineRepo = AppDataSource.getRepository(DeclineRequest);
      const declineRequest = declineRepo.create({ assignment, reason, status: DeclineRequestStatus.Pending });
      await declineRepo.save(declineRequest);

      return res.status(201).json({
        message: 'Decline request submitted and awaiting coordinator approval',
        declineRequestId: declineRequest.id,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async processDeclineRequest(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const { declineRequestId, decision } = req.body;
      if (!declineRequestId || !decision) {
        return res.status(400).json({ message: 'Missing declineRequestId or decision' });
      }
      if (decision !== 'approve' && decision !== 'reject') {
        return res.status(400).json({ message: 'decision must be "approve" or "reject"' });
      }

      const declineRepo = AppDataSource.getRepository(DeclineRequest);
      const declineRequest = await declineRepo.findOne({
        where: { id: declineRequestId },
        relations: ['assignment', 'assignment.round', 'assignment.round.paper', 'assignment.round.paper.coordinators'],
      });
      if (!declineRequest) return res.status(404).json({ message: 'Decline request not found' });

      if (declineRequest.status !== DeclineRequestStatus.Pending) {
        return res.status(400).json({ message: 'Decline request has already been processed' });
      }

      const isOwner = declineRequest.assignment.round.paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      const assignRepo = AppDataSource.getRepository(Assignment);

      if (decision === 'approve') {
        declineRequest.status = DeclineRequestStatus.Approved;
        declineRequest.assignment.status = AssignmentStatus.Declined;
        declineRequest.assignment.declineReason = declineRequest.reason;
        await assignRepo.save(declineRequest.assignment);
      } else {
        declineRequest.status = DeclineRequestStatus.Rejected;
      }

      await declineRepo.save(declineRequest);

      return res.status(200).json({
        message: decision === 'approve' ? 'Decline request approved' : 'Decline request rejected',
        declineRequestId: declineRequest.id,
        assignmentStatus: declineRequest.assignment.status,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async requestDeadlineExtension(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { assignmentId, reason, requestedDeadline } = req.body;
      if (!assignmentId || !reason || !requestedDeadline) {
        return res.status(400).json({ message: 'Missing assignmentId, reason, or requestedDeadline' });
      }

      const requested = new Date(requestedDeadline);
      if (isNaN(requested.getTime())) {
        return res.status(400).json({ message: 'Invalid requestedDeadline format' });
      }

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id: assignmentId },
        relations: ['reviewer', 'round', 'round.paper', 'round.paper.coordinators'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

      if (assignment.reviewer.id !== user.id) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }
      if (assignment.status !== AssignmentStatus.Accepted) {
        return res.status(400).json({ message: 'Assignment must be in Accepted status to request an extension' });
      }

      if (assignment.deadline && requested <= assignment.deadline) {
        return res.status(400).json({ message: 'Requested deadline must be after your current assignment deadline' });
      }

      const extensionRepo = AppDataSource.getRepository(Extension);

      // Check for an existing pending extension — overwrite it instead of creating a duplicate
      const pendingExtension = await extensionRepo.findOne({
        where: { assignment: { id: assignmentId }, status: ExtensionStatus.Pending },
      });

      let extension: Extension;
      let isUpdate = false;

      if (pendingExtension) {
        pendingExtension.reason = reason;
        pendingExtension.requestedDeadline = requested;
        extension = await extensionRepo.save(pendingExtension);
        isUpdate = true;
      } else {
        extension = await extensionRepo.save(
          extensionRepo.create({ assignment, reason, requestedDeadline: requested, status: ExtensionStatus.Pending })
        );
      }

      // Notify all coordinators of the paper
      const coordinators = assignment.round.paper.coordinators ?? [];
      const paperTitle = assignment.round.paper.title;
      const roundNumber = assignment.round.roundNumber;
      const currentDeadline = assignment.deadline?.toISOString() ?? 'N/A';

      await Promise.all(coordinators.map(c =>
        sendEmail(
          c,
          `${isUpdate ? '[Updated] ' : ''}Extension Request from ${user.name}`,
          `Hello ${c.name},\n\n${user.name} has ${isUpdate ? 'updated their' : 'submitted a new'} deadline extension request.\n\nPaper: ${paperTitle}\nRound: ${roundNumber}\nCurrent deadline: ${currentDeadline}\nRequested deadline: ${requested.toISOString()}\nReason: ${reason}\n\nPlease log in to approve or reject this request.`
        )
      ));

      return res.status(isUpdate ? 200 : 201).json({
        message: isUpdate ? 'Extension request updated' : 'Extension request submitted',
        extensionId: extension.id,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async processExtensionRequest(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const { extensionId, decision, approvedDeadline } = req.body;
      if (!extensionId || !decision) {
        return res.status(400).json({ message: 'Missing extensionId or decision' });
      }
      if (decision !== 'approve' && decision !== 'reject') {
        return res.status(400).json({ message: 'decision must be "approve" or "reject"' });
      }
      if (decision === 'approve') {
        if (!approvedDeadline) return res.status(400).json({ message: 'approvedDeadline is required when approving' });
        if (isNaN(new Date(approvedDeadline).getTime())) return res.status(400).json({ message: 'Invalid approvedDeadline format' });
      }

      const extensionRepo = AppDataSource.getRepository(Extension);
      const extension = await extensionRepo.findOne({
        where: { id: extensionId },
        relations: ['assignment', 'assignment.round', 'assignment.round.paper', 'assignment.round.paper.coordinators'],
      });
      if (!extension) return res.status(404).json({ message: 'Extension request not found' });

      if (extension.status !== ExtensionStatus.Pending) {
        return res.status(400).json({ message: 'Extension request has already been processed' });
      }

      const isOwner = extension.assignment.round.paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      const assignRepo = AppDataSource.getRepository(Assignment);

      if (decision === 'approve') {
        extension.status = ExtensionStatus.Approved;
        extension.approvedDeadline = new Date(approvedDeadline);
        extension.assignment.deadline = new Date(approvedDeadline);
        await assignRepo.save(extension.assignment);
      } else {
        extension.status = ExtensionStatus.Rejected;
      }

      await extensionRepo.save(extension);

      return res.status(200).json({
        message: decision === 'approve' ? 'Extension approved' : 'Extension rejected',
        extensionId: extension.id,
        assignmentDeadline: extension.assignment.deadline,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async completeReview(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const { assignmentId, summary } = req.body;
      if (!assignmentId) return res.status(400).json({ message: 'Missing assignmentId' });

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id: assignmentId },
        relations: ['reviewer'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

      if (assignment.reviewer.id !== user.id) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }
      if (assignment.status !== AssignmentStatus.Accepted) {
        return res.status(400).json({ message: 'Assignment must be in Accepted status to complete' });
      }

      if (summary && typeof summary === 'string' && summary.trim()) {
        const summaryRepo = AppDataSource.getRepository(Summary);
        const summaryRecord = summaryRepo.create({ assignment, text: summary.trim() });
        await summaryRepo.save(summaryRecord);
      }

      assignment.status = AssignmentStatus.Completed;
      assignment.submittedAt = new Date();
      await assignRepo.save(assignment);

      return res.status(200).json({ message: 'Review completed', id: assignment.id, status: assignment.status });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}
