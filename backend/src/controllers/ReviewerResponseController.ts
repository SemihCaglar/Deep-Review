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
  // ── body-based: POST /responses/invitation ────────────────────────────────
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
        relations: ['reviewer', 'declineRequests'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
      if (assignment.reviewer.id !== user.id) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }
      if (assignment.status !== AssignmentStatus.Invited) {
        return res.status(400).json({ message: `Cannot respond to invitation: your assignment is currently '${assignment.status}'. Only Invited assignments can be accepted or declined.` });
      }

      if (response === 'accept') {
        assignment.status = AssignmentStatus.Accepted;
        assignment.acceptedAt = new Date();
        await assignRepo.save(assignment);
        return res.status(200).json({ message: 'Invitation accepted', id: assignment.id, status: assignment.status });
      }

      if (!reason) return res.status(400).json({ message: 'reason is required when declining' });
      const declineRepo = AppDataSource.getRepository(DeclineRequest);
      const existingPending = assignment.declineRequests?.find(d => d.status === DeclineRequestStatus.Pending);
      const declineRequest = existingPending ?? declineRepo.create({ assignment, status: DeclineRequestStatus.Pending });
      declineRequest.reason = reason;
      assignment.status = AssignmentStatus.PendingDecline;
      assignment.declineReason = reason;
      await assignRepo.save(assignment);
      await declineRepo.save(declineRequest);

      return res.status(201).json({
        message: 'Decline request submitted and awaiting coordinator approval',
        declineRequestId: declineRequest.id,
        assignmentStatus: assignment.status,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── param-based: PATCH /responses/:id/accept ─────────────────────────────
  static async acceptInvitation(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id: req.params.id as string },
        relations: ['reviewer'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
      if (assignment.reviewer.id !== user.id) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }
      if (assignment.status !== AssignmentStatus.Invited) {
        return res.status(400).json({ message: `Cannot accept invitation: your assignment is currently '${assignment.status}'. Only Invited assignments can be accepted.` });
      }

      assignment.status = AssignmentStatus.Accepted;
      assignment.acceptedAt = new Date();
      await assignRepo.save(assignment);
      return res.status(200).json({ message: 'Invitation accepted', id: assignment.id, status: assignment.status });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── param-based: POST /responses/:id/decline-request ─────────────────────
  static async requestDeclineForAssignment(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const reason = req.body?.declineReason ?? req.body?.reason;
      if (!reason) return res.status(400).json({ message: 'reason is required when declining' });

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id: req.params.id as string },
        relations: ['reviewer'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
      if (assignment.reviewer.id !== user.id) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }
      const allowedStatuses = [
        AssignmentStatus.Invited,
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.PendingDecline,
      ];
      if (!allowedStatuses.includes(assignment.status)) {
        return res.status(400).json({ message: `Cannot submit decline request: your assignment is currently '${assignment.status}'. Decline requests can only be submitted for Invited, Accepted, PendingExtension, or PendingDecline assignments.` });
      }

      const declineRepo = AppDataSource.getRepository(DeclineRequest);
      const pendingDecline = await declineRepo.findOne({
        where: { assignment: { id: req.params.id as string }, status: DeclineRequestStatus.Pending },
      });

      let declineRequest: DeclineRequest;
      let isUpdate = false;

      if (pendingDecline) {
        pendingDecline.reason = reason;
        declineRequest = await declineRepo.save(pendingDecline);
        isUpdate = true;
      } else {
        declineRequest = await declineRepo.save(
          declineRepo.create({ assignment, reason, status: DeclineRequestStatus.Pending })
        );
        if (assignment.status !== AssignmentStatus.PendingDecline) {
          assignment.status = AssignmentStatus.PendingDecline;
        }
      }
      assignment.declineReason = reason;
      await assignRepo.save(assignment);

      return res.status(isUpdate ? 200 : 201).json({
        message: isUpdate ? 'Decline request updated' : 'Decline request submitted and awaiting coordinator approval',
        declineRequestId: declineRequest.id,
        assignmentStatus: assignment.status,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async requestDecline(req: AuthenticatedRequest, res: Response) {
    return ReviewerResponseController.requestDeclineForAssignment(req, res);
  }

  // ── body-based: POST /responses/extension ────────────────────────────────
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
      const allowedForExtension = [
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.PendingDecline,
      ];
      if (!allowedForExtension.includes(assignment.status)) {
        return res.status(400).json({ message: `Cannot request extension: your assignment is currently '${assignment.status}'. Extensions can only be requested for Accepted, PendingExtension, or PendingDecline assignments.` });
      }
      const effectiveDeadline = assignment.deadline ?? assignment.round.deadline;
      if (!effectiveDeadline) {
        return res.status(400).json({ message: 'No deadline is set for this assignment or round — cannot request an extension without a current deadline.' });
      }
      const currentDeadlineStr = effectiveDeadline.toISOString().split('T')[0];
      if (requested <= effectiveDeadline) {
        return res.status(400).json({ message: `Requested deadline must be after your current deadline (${currentDeadlineStr}).` });
      }
      if (assignment.round.submissionDeadline) {
        const subDeadlineStr = assignment.round.submissionDeadline.toISOString().split('T')[0];
        if (requested > assignment.round.submissionDeadline) {
          return res.status(400).json({ message: `Extension cannot exceed the conference submission deadline (${subDeadlineStr}).` });
        }
      } else {
        const maxAllowed = new Date(effectiveDeadline);
        maxAllowed.setDate(maxAllowed.getDate() + 5);
        const maxStr = maxAllowed.toISOString().split('T')[0];
        if (requested > maxAllowed) {
          return res.status(400).json({ message: `Extension cannot exceed 5 days beyond your current deadline. Maximum allowed: ${maxStr}.` });
        }
      }

      const extensionRepo = AppDataSource.getRepository(Extension);
      const pendingExtension = await extensionRepo.findOne({
        where: { assignment: { id: assignmentId }, status: ExtensionStatus.Pending },
      });
      const canCreateRequest = assignment.status === AssignmentStatus.Accepted || assignment.status === AssignmentStatus.PendingDecline;
      const canUpdatePendingRequest = [AssignmentStatus.PendingExtension, AssignmentStatus.PendingDecline].includes(assignment.status) && !!pendingExtension;
      if (!canCreateRequest && !canUpdatePendingRequest) {
        return res.status(400).json({ message: 'Assignment must be in Accepted, PendingExtension, or PendingDecline status to request an extension' });
      }

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
        if (assignment.status === AssignmentStatus.Accepted) {
          assignment.status = AssignmentStatus.PendingExtension;
          await assignRepo.save(assignment);
        }
        // PendingDecline stays PendingDecline; PendingExtension stays PendingExtension
      }

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
        assignmentStatus: assignment.status,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── param-based: POST /responses/:id/extension-request ───────────────────
  static async requestExtensionForAssignment(req: AuthenticatedRequest, res: Response) {
    const reason = req.body?.reason ?? req.body?.extensionReason;
    const requestedDeadline = req.body?.proposedDeadline ?? req.body?.requestedDeadline;
    const patched = { ...req, body: { ...req.body, assignmentId: req.params.id, reason, requestedDeadline } } as AuthenticatedRequest;
    return ReviewerResponseController.requestDeadlineExtension(patched, res);
  }

  // ── coordinator: process decline ─────────────────────────────────────────
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
        return res.status(400).json({ message: `Decline request has already been processed (${declineRequest.status}). No further action is possible.` });
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
        const wasPreviouslyAccepted = declineRequest.assignment.acceptedAt != null;
        declineRequest.assignment.status = wasPreviouslyAccepted
          ? AssignmentStatus.Accepted
          : AssignmentStatus.Invited;
        declineRequest.assignment.declineReason = null;
        await assignRepo.save(declineRequest.assignment);
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

  // ── coordinator: process extension ───────────────────────────────────────
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
        return res.status(400).json({ message: `Extension request has already been processed (${extension.status}). No further action is possible.` });
      }

      const isOwner = extension.assignment.round.paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      const assignRepo = AppDataSource.getRepository(Assignment);

      if (decision === 'approve') {
        const approved = new Date(approvedDeadline);
        const round = extension.assignment.round;
        const ceiling = round.venueCategory === 'Conference' && round.submissionDeadline
          ? round.submissionDeadline
          : round.deadline;
        if (ceiling && approved.getTime() > ceiling.getTime()) {
          const label = round.venueCategory === 'Conference' ? 'the conference submission deadline' : 'the round deadline';
          const cap = ceiling.toISOString().split('T')[0];
          return res.status(400).json({ message: `Approved deadline cannot exceed ${label} (${cap}).` });
        }
        extension.status = ExtensionStatus.Approved;
        extension.approvedDeadline = approved;
        extension.assignment.deadline = approved;
      } else {
        extension.status = ExtensionStatus.Rejected;
      }

      if (extension.assignment.status === AssignmentStatus.PendingExtension) {
        extension.assignment.status = AssignmentStatus.Accepted;
      }
      await assignRepo.save(extension.assignment);
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

  // ── reviewer: submit summary without completing ───────────────────────────
  static async submitReviewSummary(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const id = req.params.id ?? req.body?.assignmentId;
      const text = req.body?.summary ?? req.body?.text;
      if (!id) return res.status(400).json({ message: 'Missing assignment id' });
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ message: 'summary is required' });
      }

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({ where: { id: id as string }, relations: ['reviewer'] });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
      if (assignment.reviewer.id !== user.id) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }

      const summaryRepo = AppDataSource.getRepository(Summary);
      const summary = summaryRepo.create({ assignment, text: text.trim() });
      const saved = await summaryRepo.save(summary);

      return res.status(201).json({ message: 'Review summary submitted', summary: saved });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── reviewer: complete review (optional summary) ──────────────────────────
  static async completeReview(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });

      const assignmentId = (req.params.id as string) ?? req.body?.assignmentId;
      if (!assignmentId) return res.status(400).json({ message: 'Missing assignmentId' });

      const assignRepo = AppDataSource.getRepository(Assignment);
      const assignment = await assignRepo.findOne({
        where: { id: assignmentId as string },
        relations: ['reviewer'],
      });
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
      if (assignment.reviewer.id !== user.id) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }
      const completableStatuses = [
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.PendingDecline,
      ];
      if (!completableStatuses.includes(assignment.status)) {
        return res.status(400).json({ message: `Cannot complete review: your assignment is currently '${assignment.status}'. Only Accepted, PendingExtension, or PendingDecline assignments can be completed.` });
      }

      const summary = req.body?.summary ?? req.body?.text;
      if (summary && typeof summary === 'string' && summary.trim()) {
        const summaryRepo = AppDataSource.getRepository(Summary);
        await summaryRepo.save(summaryRepo.create({ assignment, text: summary.trim() }));
      }

      assignment.status = AssignmentStatus.Completed;
      assignment.submittedAt = new Date();
      await assignRepo.save(assignment);

      // Auto-reject any pending decline/extension requests on submission
      const declineRepo = AppDataSource.getRepository(DeclineRequest);
      const extensionRepo = AppDataSource.getRepository(Extension);

      const pendingDeclines = await declineRepo.find({
        where: { assignment: { id: assignment.id }, status: DeclineRequestStatus.Pending },
      });
      if (pendingDeclines.length > 0) {
        for (const d of pendingDeclines) d.status = DeclineRequestStatus.Rejected;
        await declineRepo.save(pendingDeclines);
      }

      const pendingExtensions = await extensionRepo.find({
        where: { assignment: { id: assignment.id }, status: ExtensionStatus.Pending },
      });
      if (pendingExtensions.length > 0) {
        for (const e of pendingExtensions) e.status = ExtensionStatus.Rejected;
        await extensionRepo.save(pendingExtensions);
      }

      return res.status(200).json({ message: 'Review completed', id: assignment.id, status: assignment.status });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async markReviewCompleted(req: AuthenticatedRequest, res: Response) {
    return ReviewerResponseController.completeReview(req, res);
  }
}
