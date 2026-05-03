import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { DeclineRequest, DeclineRequestStatus } from '../entities/DeclineRequest';
import { Extension, ExtensionStatus } from '../entities/Extension';
import { Lab } from '../entities/Lab';
import { ReviewerResponse, ReviewerResponseStatus } from '../entities/ReviewerResponse';
import { User, UserRole } from '../entities/User';
import { RoundStatus, VenueCategory } from '../entities/Round';
import { sendTemplatedEmail } from './emailService';
import { TemplateName } from '../entities/Template';
import { RoundService } from './RoundService';

export class CoordinatorServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface CoordinatorContext {
  coordinatorId: string;
  labId: string;
}

export type CoordinatorDecision = 'Approve' | 'Reject';

function normalizeId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CoordinatorServiceError(400, `${fieldName} is required`);
  }

  return value.trim();
}

export class CoordinatorService {
  static async processDeclineRequest(
    assignmentOrResponseId: string,
    decision: CoordinatorDecision,
    context: CoordinatorContext,
  ): Promise<Assignment> {
    const normalizedId = normalizeId(assignmentOrResponseId, 'Assignment id');

    const result = await AppDataSource.transaction(async (manager) => {
      const assignment = await this.findAssignmentByAssignmentOrResponseId(manager, normalizedId);
      await this.assertCoordinatorAccess(manager, assignment, context);

      const declineRepository = manager.getRepository(DeclineRequest);
      const declineRequest = await declineRepository.findOne({
        where: { assignment: { id: assignment.id }, status: DeclineRequestStatus.Pending },
        order: { requestedAt: 'DESC' },
      });

      if (!declineRequest) {
        const processedRequest = await declineRepository.findOne({
          where: { assignment: { id: assignment.id } },
          order: { requestedAt: 'DESC' },
        });
        if (processedRequest && processedRequest.status !== DeclineRequestStatus.Pending) {
          throw new CoordinatorServiceError(
            400,
            `Decline request has already been processed (${processedRequest.status}). No further action is possible.`,
          );
        }
      }

      if (assignment.status !== AssignmentStatus.PendingDecline) {
        throw new CoordinatorServiceError(
          400,
          'Assignment must be PendingDecline before a decline request can be processed',
        );
      }
      if (!declineRequest) {
        throw new CoordinatorServiceError(404, 'Pending decline request not found for this assignment');
      }

      const isApproved = decision === 'Approve';
      assignment.status = isApproved
        ? AssignmentStatus.Declined
        : (assignment.acceptedAt ? AssignmentStatus.Accepted : AssignmentStatus.Invited);
      if (!isApproved) {
        assignment.declineReason = null;
        declineRequest.status = DeclineRequestStatus.Rejected;
      } else {
        assignment.declineReason = declineRequest.reason;
        declineRequest.status = DeclineRequestStatus.Approved;

        const extensionRepo = manager.getRepository(Extension);
        const pendingExtensions = await extensionRepo.find({
          where: { assignment: { id: assignment.id }, status: ExtensionStatus.Pending },
        });
        if (pendingExtensions.length > 0) {
          for (const ext of pendingExtensions) ext.status = ExtensionStatus.Rejected;
          await extensionRepo.save(pendingExtensions);
        }
      }

      await declineRepository.save(declineRequest);
      const savedAssignment = await manager.getRepository(Assignment).save(assignment);
      await this.upsertCompatibilityResponse(
        manager,
        savedAssignment,
        isApproved ? ReviewerResponseStatus.Declined : ReviewerResponseStatus.Accepted,
        context.labId,
        { declineReason: isApproved ? savedAssignment.declineReason ?? null : null },
      );

      return this.loadAssignment(manager, savedAssignment.id);
    });

    const assignWithReviewer = await AppDataSource.getRepository(Assignment).findOne({
      where: { id: result.id },
      relations: ['reviewer', 'round', 'round.paper'],
    });
    if (assignWithReviewer?.reviewer) {
      const reviewer = assignWithReviewer.reviewer;
      const paperTitle = assignWithReviewer.round.paper.title;
      const roundNumber = assignWithReviewer.round.roundNumber;
      if (decision === 'Approve') {
        sendTemplatedEmail(reviewer, TemplateName.DECLINE_APPROVED, {
          userName: reviewer.name,
        }).catch(console.error);
      } else {
        sendTemplatedEmail(reviewer, TemplateName.DECLINE_REJECTED, {
          userName: reviewer.name,
        }).catch(console.error);
      }
    }

    if (decision === 'Approve') {
      await RoundService.completeRoundIfAllAssignmentsTerminal(result.round.id);
    }

    return result;
  }

  static async processExtensionRequest(
    assignmentOrResponseId: string,
    extensionId: string,
    decision: CoordinatorDecision,
    newDeadline: unknown,
    context: CoordinatorContext,
  ): Promise<Assignment> {
    const normalizedAssignmentId = normalizeId(assignmentOrResponseId, 'Assignment id');
    const normalizedExtensionId = normalizeId(extensionId, 'extensionId');

    return AppDataSource.transaction(async (manager) => {
      const assignment = await this.findAssignmentByAssignmentOrResponseId(manager, normalizedAssignmentId);
      await this.assertCoordinatorAccess(manager, assignment, context);

      const extensionRepository = manager.getRepository(Extension);
      const extension = await extensionRepository.findOne({
        where: {
          id: normalizedExtensionId,
          assignment: { id: assignment.id },
        },
        relations: ['assignment'],
      });

      if (!extension) {
        throw new CoordinatorServiceError(404, 'Extension request not found for this assignment');
      }

      if (extension.status !== ExtensionStatus.Pending) {
        throw new CoordinatorServiceError(
          400,
          `Extension request has already been processed (${extension.status}). No further action is possible.`,
        );
      }

      if (assignment.status !== AssignmentStatus.PendingExtension) {
        throw new CoordinatorServiceError(
          400,
          'Assignment must be PendingExtension before an extension request can be processed',
        );
      }

      assignment.status = AssignmentStatus.Accepted;

      if (decision === 'Approve') {
        const approvedDeadline = this.parseDate(newDeadline, 'newDeadline');
        const round = assignment.round;
        const deadlineCeiling =
          round.venueCategory === VenueCategory.Conference && round.submissionDeadline
            ? round.submissionDeadline
            : round.deadline;

        if (!deadlineCeiling) {
          throw new CoordinatorServiceError(400, 'Round deadline is not set');
        }

        if (approvedDeadline.getTime() > deadlineCeiling.getTime()) {
          const label =
            round.venueCategory === VenueCategory.Conference
              ? 'the submission deadline'
              : 'the round deadline';
          throw new CoordinatorServiceError(
            400,
            `Approved deadline cannot exceed ${label}`,
          );
        }

        extension.status = ExtensionStatus.Approved;
        extension.approvedDeadline = approvedDeadline;
        assignment.deadline = approvedDeadline;
      } else {
        extension.status = ExtensionStatus.Rejected;
        extension.approvedDeadline = null;
      }

      await extensionRepository.save(extension);
      const savedAssignment = await manager.getRepository(Assignment).save(assignment);
      await this.upsertCompatibilityResponse(
        manager,
        savedAssignment,
        ReviewerResponseStatus.Accepted,
        context.labId,
      );

      return this.loadAssignment(manager, savedAssignment.id);
    });
  }

  static async reassignReviewer(
    oldAssignmentId: string,
    newReviewerId: string,
    context: CoordinatorContext,
  ): Promise<Assignment> {
    const normalizedOldId = normalizeId(oldAssignmentId, 'oldAssignmentId');
    const normalizedNewReviewerId = normalizeId(newReviewerId, 'newReviewerId');

    return AppDataSource.transaction(async (manager) => {
      const oldAssignment = await this.findAssignmentByAssignmentOrResponseId(manager, normalizedOldId);
      await this.assertCoordinatorAccess(manager, oldAssignment, context);

      const cancellableStatuses: AssignmentStatus[] = [
        AssignmentStatus.Invited,
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingDecline,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.Declined,
        AssignmentStatus.Cancelled,
      ];
      if (!cancellableStatuses.includes(oldAssignment.status)) {
        throw new CoordinatorServiceError(
          400,
          `Cannot reassign an assignment with status "${oldAssignment.status}"`,
        );
      }

      const round = oldAssignment.round;
      const paper = round.paper;

      if (round.status === RoundStatus.Completed) {
        throw new CoordinatorServiceError(
          400,
          'Cannot reassign reviewers after the round has been completed',
        );
      }

      const newReviewer = await manager.getRepository(User).findOne({
        where: { id: normalizedNewReviewerId },
        relations: ['labs'],
      });
      if (!newReviewer) throw new CoordinatorServiceError(404, 'New reviewer not found');
      if (newReviewer.role === UserRole.Coordinator || newReviewer.role === UserRole.Admin) {
        throw new CoordinatorServiceError(400, 'Coordinators and admins cannot be assigned as reviewers');
      }

      const paperLabIds = paper.labs?.map(l => l.id) ?? [];
      const reviewerLabIds = newReviewer.labs?.map(l => l.id) ?? [];
      const sharesLab = reviewerLabIds.some(lid => paperLabIds.includes(lid));
      if (!sharesLab) {
        throw new CoordinatorServiceError(400, 'New reviewer must belong to the same lab as the paper');
      }

      const authorIds = paper.authors?.map(a => a.id) ?? [];
      if (authorIds.includes(normalizedNewReviewerId)) {
        throw new CoordinatorServiceError(400, 'Cannot assign an author of the paper as reviewer (conflict of interest)');
      }

      const assignRepo = manager.getRepository(Assignment);
      const activeExists = await assignRepo.findOne({
        where: {
          round: { id: round.id },
          reviewer: { id: normalizedNewReviewerId },
          status: In([
            AssignmentStatus.Invited,
            AssignmentStatus.Accepted,
            AssignmentStatus.PendingDecline,
            AssignmentStatus.PendingExtension,
          ]),
        },
      });
      if (activeExists) {
        throw new CoordinatorServiceError(400, 'This reviewer already has an active assignment in the current round');
      }

      const statusesToMarkReassigned = new Set([
        AssignmentStatus.Invited,
        AssignmentStatus.Accepted,
        AssignmentStatus.PendingDecline,
        AssignmentStatus.PendingExtension,
        AssignmentStatus.Overdue,
      ]);
      if (statusesToMarkReassigned.has(oldAssignment.status)) {
        oldAssignment.status = AssignmentStatus.Reassigned;
        await assignRepo.save(oldAssignment);
      }

      const newAssignment = new Assignment();
      newAssignment.round = round;
      newAssignment.reviewer = newReviewer;
      newAssignment.status = AssignmentStatus.Invited;
      newAssignment.deadline = round.deadline;
      newAssignment.invitationSent = false;
      const savedNew = await assignRepo.save(newAssignment);

      return this.loadAssignment(manager, savedNew.id);
    });
  }

  private static async findAssignmentByAssignmentOrResponseId(
    manager: EntityManager,
    id: string,
  ): Promise<Assignment> {
    const assignmentRepository = manager.getRepository(Assignment);
    const assignment = await assignmentRepository.findOne({
      where: { id },
      relations: ['reviewer', 'reviewer.labs', 'round', 'round.paper', 'round.paper.labs', 'round.paper.authors', 'response', 'extensions', 'declineRequests'],
    });

    if (assignment) {
      return assignment;
    }

    const responseRepository = manager.getRepository(ReviewerResponse);
    const response = await responseRepository.findOne({
      where: { id },
      relations: [
        'assignment',
        'assignment.reviewer',
        'assignment.reviewer.labs',
        'assignment.round',
        'assignment.round.paper',
        'assignment.round.paper.labs',
        'assignment.round.paper.authors',
        'assignment.response',
        'assignment.extensions',
      ],
    });

    if (!response?.assignment) {
      throw new CoordinatorServiceError(404, 'Assignment or reviewer response not found');
    }

    return response.assignment;
  }

  private static parseDate(value: unknown, fieldName: string): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new CoordinatorServiceError(400, `${fieldName} must be a valid date`);
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new CoordinatorServiceError(400, `${fieldName} must be a valid date`);
    }

    return parsedDate;
  }

  private static async assertCoordinatorAccess(
    manager: EntityManager,
    assignment: Assignment,
    context: CoordinatorContext,
  ): Promise<void> {
    const assignmentLabIds = assignment.round.paper.labs?.map((lab) => lab.id) || [];
    if (!assignmentLabIds.includes(context.labId)) {
      throw new CoordinatorServiceError(403, 'Assignment does not belong to the provided lab');
    }

    const lab = await manager.getRepository(Lab).findOne({
      where: { id: context.labId },
      relations: ['coordinator'],
    });

    if (!lab?.coordinator) {
      throw new CoordinatorServiceError(403, 'Lab coordinator could not be resolved');
    }

    if (lab.coordinator.id !== context.coordinatorId || lab.coordinator.role !== UserRole.Coordinator) {
      throw new CoordinatorServiceError(403, 'Only the lab coordinator can process this request');
    }
  }

  private static async upsertCompatibilityResponse(
    manager: EntityManager,
    assignment: Assignment,
    status: ReviewerResponseStatus,
    labId: string,
    updates?: {
      declineReason?: string | null;
      extensionReason?: string | null;
    },
  ): Promise<ReviewerResponse> {
    const responseRepository = manager.getRepository(ReviewerResponse);
    let response = await responseRepository.findOne({
      where: { assignment: { id: assignment.id } },
      relations: ['assignment'],
    });

    if (!response) {
      response = new ReviewerResponse();
      response.assignment = assignment;
      response.reviewer = assignment.reviewer;
      response.reviewRound = assignment.round;
      response.lab = assignment.round.paper.labs?.find((lab) => lab.id === labId) || null;
    }

    response.status = status;
    if (updates?.declineReason !== undefined) {
      response.declineReason = updates.declineReason;
    }
    if (updates?.extensionReason !== undefined) {
      response.extensionReason = updates.extensionReason;
    }

    return responseRepository.save(response);
  }

  private static async loadAssignment(manager: EntityManager, id: string): Promise<Assignment> {
    const assignment = await manager.getRepository(Assignment).findOne({
      where: { id },
      relations: ['reviewer', 'reviewer.labs', 'round', 'round.paper', 'round.paper.labs', 'response', 'extensions'],
    });

    if (!assignment) {
      throw new CoordinatorServiceError(404, 'Assignment not found after update');
    }

    return assignment;
  }
}
