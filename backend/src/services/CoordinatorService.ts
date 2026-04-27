import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { Extension, ExtensionStatus } from '../entities/Extension';
import { Lab } from '../entities/Lab';
import { ReviewerResponse, ReviewerResponseStatus } from '../entities/ReviewerResponse';
import { UserRole } from '../entities/User';

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

    return AppDataSource.transaction(async (manager) => {
      const assignment = await this.findAssignmentByAssignmentOrResponseId(manager, normalizedId);
      await this.assertCoordinatorAccess(manager, assignment, context);

      if (assignment.status !== AssignmentStatus.PendingDecline) {
        throw new CoordinatorServiceError(
          400,
          'Assignment must be PendingDecline before a decline request can be processed',
        );
      }

      const isApproved = decision === 'Approve';
      assignment.status = isApproved ? AssignmentStatus.Declined : AssignmentStatus.Accepted;
      if (!isApproved) {
        assignment.acceptedAt = assignment.acceptedAt ?? new Date();
        assignment.declineReason = null;
        assignment.acceptedAt = assignment.acceptedAt ?? new Date();
      }

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

      if (assignment.status !== AssignmentStatus.PendingExtension) {
        throw new CoordinatorServiceError(
          400,
          'Assignment must be PendingExtension before an extension request can be processed',
        );
      }

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
        throw new CoordinatorServiceError(400, 'Only pending extension requests can be processed');
      }

      assignment.status = AssignmentStatus.Accepted;

      if (decision === 'Approve') {
        const approvedDeadline = this.parseDate(newDeadline, 'newDeadline');
        const roundDeadline = assignment.round.deadline;
        if (approvedDeadline.getTime() > roundDeadline.getTime()) {
          throw new CoordinatorServiceError(
            400,
            'Approved deadline cannot exceed the round deadline',
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

  private static async findAssignmentByAssignmentOrResponseId(
    manager: EntityManager,
    id: string,
  ): Promise<Assignment> {
    const assignmentRepository = manager.getRepository(Assignment);
    const assignment = await assignmentRepository.findOne({
      where: { id },
      relations: ['reviewer', 'reviewer.labs', 'round', 'round.paper', 'round.paper.labs', 'response', 'extensions'],
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
