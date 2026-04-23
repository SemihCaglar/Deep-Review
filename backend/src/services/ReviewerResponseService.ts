import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { Extension, ExtensionStatus } from '../entities/Extension';
import { Lab } from '../entities/Lab';
import { ReviewerResponse, ReviewerResponseStatus } from '../entities/ReviewerResponse';

export class ReviewerResponseServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface ReviewerResponseContext {
  userId: string;
  labId: string;
}

function normalizeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ReviewerResponseServiceError(400, `${fieldName} must be a valid date`);
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new ReviewerResponseServiceError(400, `${fieldName} must be a valid date`);
  }

  return parsedDate;
}

interface ReviewerResponseCompatibilityUpdate {
  declineReason?: string | null;
  extensionReason?: string | null;
}

export class ReviewerResponseService {
  static async acceptAssignment(id: string, context: ReviewerResponseContext): Promise<Assignment> {
    const assignment = await this.findAssignmentByAssignmentOrResponseId(id);
    this.assertReviewerAndLabAccess(assignment, context);

    if (assignment.status !== AssignmentStatus.Invited) {
      throw new ReviewerResponseServiceError(400, 'Assignment must be Invited before it can be accepted');
    }

    assignment.status = AssignmentStatus.Accepted;
    assignment.acceptedAt = new Date();

    const assignmentRepository = AppDataSource.getRepository(Assignment);
    const savedAssignment = await assignmentRepository.save(assignment);
    await this.upsertCompatibilityResponse(savedAssignment, ReviewerResponseStatus.Accepted, context.labId);

    return this.loadAssignmentForResponse(savedAssignment.id);
  }

  static async requestDecline(
    id: string,
    declineReason: string,
    context: ReviewerResponseContext,
  ): Promise<Assignment> {
    const trimmedReason = declineReason.trim();
    if (!trimmedReason) {
      throw new ReviewerResponseServiceError(400, 'declineReason is required');
    }

    const assignment = await this.findAssignmentByAssignmentOrResponseId(id);
    this.assertReviewerAndLabAccess(assignment, context);

    if (assignment.status !== AssignmentStatus.Invited) {
      throw new ReviewerResponseServiceError(
        400,
        'Assignment must be Invited before a decline request can be submitted',
      );
    }

    assignment.status = AssignmentStatus.PendingDecline;
    assignment.declineReason = trimmedReason;

    const assignmentRepository = AppDataSource.getRepository(Assignment);
    const savedAssignment = await assignmentRepository.save(assignment);
    await this.upsertCompatibilityResponse(
      savedAssignment,
      ReviewerResponseStatus.PendingDecline,
      context.labId,
      { declineReason: trimmedReason },
    );

    return this.loadAssignmentForResponse(savedAssignment.id);
  }

  static async requestExtension(
    id: string,
    extensionReason: string,
    proposedDeadline: unknown,
    context: ReviewerResponseContext,
  ): Promise<Assignment> {
    const trimmedReason = extensionReason.trim();
    if (!trimmedReason) {
      throw new ReviewerResponseServiceError(400, 'reason is required');
    }

    const requestedDeadline = parseDate(proposedDeadline, 'proposedDeadline');
    const assignment = await this.findAssignmentByAssignmentOrResponseId(id);
    this.assertReviewerAndLabAccess(assignment, context);

    if (assignment.status !== AssignmentStatus.Accepted) {
      throw new ReviewerResponseServiceError(
        400,
        'Assignment must be Accepted before an extension request can be submitted',
      );
    }

    const extensionRepository = AppDataSource.getRepository(Extension);
    const assignmentRepository = AppDataSource.getRepository(Assignment);

    const extension = new Extension();
    extension.reason = trimmedReason;
    extension.requestedDeadline = requestedDeadline;
    extension.status = ExtensionStatus.Pending;
    extension.assignment = assignment;

    assignment.status = AssignmentStatus.PendingExtension;

    const savedAssignment = await assignmentRepository.save(assignment);
    await extensionRepository.save(extension);
    await this.upsertCompatibilityResponse(
      savedAssignment,
      ReviewerResponseStatus.PendingExtension,
      context.labId,
      { extensionReason: trimmedReason },
    );

    return this.loadAssignmentForResponse(savedAssignment.id);
  }

  static async processDeclineRequest(
    id: string,
    isApproved: boolean,
    context: ReviewerResponseContext,
  ): Promise<Assignment> {
    const assignment = await this.findAssignmentByAssignmentOrResponseId(id);
    await this.assertCoordinatorAndLabAccess(assignment, context);

    if (assignment.status !== AssignmentStatus.PendingDecline) {
      throw new ReviewerResponseServiceError(
        400,
        'Assignment must be PendingDecline before a decline request can be processed',
      );
    }

    assignment.status = isApproved ? AssignmentStatus.Declined : AssignmentStatus.Accepted;
    if (!isApproved) {
      assignment.acceptedAt = assignment.acceptedAt ?? new Date();
      assignment.declineReason = null;
    }

    const assignmentRepository = AppDataSource.getRepository(Assignment);
    const savedAssignment = await assignmentRepository.save(assignment);
    await this.upsertCompatibilityResponse(
      savedAssignment,
      isApproved ? ReviewerResponseStatus.Declined : ReviewerResponseStatus.Accepted,
      context.labId,
      { declineReason: isApproved ? assignment.declineReason ?? undefined : null },
    );

    return this.loadAssignmentForResponse(savedAssignment.id);
  }

  static async processExtensionRequest(
    id: string,
    isApproved: boolean,
    newDeadline: unknown,
    context: ReviewerResponseContext,
  ): Promise<Assignment> {
    const assignment = await this.findAssignmentByAssignmentOrResponseId(id);
    await this.assertCoordinatorAndLabAccess(assignment, context);

    if (assignment.status !== AssignmentStatus.PendingExtension) {
      throw new ReviewerResponseServiceError(
        400,
        'Assignment must be PendingExtension before an extension request can be processed',
      );
    }

    const extensionRepository = AppDataSource.getRepository(Extension);
    const pendingExtension = await extensionRepository.findOne({
      where: {
        assignment: { id: assignment.id },
        status: ExtensionStatus.Pending,
      },
      relations: ['assignment'],
      order: { requestedAt: 'DESC' },
    });

    if (!pendingExtension) {
      throw new ReviewerResponseServiceError(404, 'Pending extension request not found for this assignment');
    }

    assignment.status = AssignmentStatus.Accepted;

    if (isApproved) {
      const approvedDeadline =
        newDeadline === undefined || newDeadline === null || newDeadline === ''
          ? pendingExtension.requestedDeadline
          : parseDate(newDeadline, 'newDeadline');

      pendingExtension.status = ExtensionStatus.Approved;
      pendingExtension.approvedDeadline = approvedDeadline;
      assignment.deadline = approvedDeadline;
    } else {
      pendingExtension.status = ExtensionStatus.Rejected;
      pendingExtension.approvedDeadline = null;
    }

    const assignmentRepository = AppDataSource.getRepository(Assignment);
    await extensionRepository.save(pendingExtension);
    const savedAssignment = await assignmentRepository.save(assignment);
    await this.upsertCompatibilityResponse(
      savedAssignment,
      ReviewerResponseStatus.Accepted,
      context.labId,
    );

    return this.loadAssignmentForResponse(savedAssignment.id);
  }

  private static async findAssignmentByAssignmentOrResponseId(id: string): Promise<Assignment> {
    const normalizedId = normalizeId(id);
    if (!normalizedId) {
      throw new ReviewerResponseServiceError(400, 'Response or assignment id is required');
    }

    const assignmentRepository = AppDataSource.getRepository(Assignment);
    const assignment = await assignmentRepository.findOne({
      where: { id: normalizedId },
      relations: ['reviewer', 'reviewer.labs', 'round', 'round.paper', 'round.paper.labs', 'response', 'extensions'],
    });

    if (assignment) {
      return assignment;
    }

    const responseRepository = AppDataSource.getRepository(ReviewerResponse);
    const response = await responseRepository.findOne({
      where: { id: normalizedId },
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
      throw new ReviewerResponseServiceError(404, 'Assignment or reviewer response not found');
    }

    return response.assignment;
  }

  private static assertReviewerAndLabAccess(assignment: Assignment, context: ReviewerResponseContext): void {
    if (assignment.reviewer.id !== context.userId) {
      throw new ReviewerResponseServiceError(403, 'Only the assigned reviewer can respond to this invitation');
    }

    const assignmentLabIds = assignment.round.paper.labs?.map((lab) => lab.id) || [];
    if (!assignmentLabIds.includes(context.labId)) {
      throw new ReviewerResponseServiceError(403, 'Assignment does not belong to the provided lab');
    }

    const reviewerLabIds = assignment.reviewer.labs?.map((lab) => lab.id) || [];
    if (!reviewerLabIds.includes(context.labId)) {
      throw new ReviewerResponseServiceError(403, 'Reviewer does not belong to the provided lab');
    }
  }

  private static async assertCoordinatorAndLabAccess(
    assignment: Assignment,
    context: ReviewerResponseContext,
  ): Promise<void> {
    const assignmentLabIds = assignment.round.paper.labs?.map((lab) => lab.id) || [];
    if (!assignmentLabIds.includes(context.labId)) {
      throw new ReviewerResponseServiceError(403, 'Assignment does not belong to the provided lab');
    }

    const labRepository = AppDataSource.getRepository(Lab);
    const lab = await labRepository.findOne({
      where: { id: context.labId },
      relations: ['coordinator'],
    });

    if (!lab?.coordinator || lab.coordinator.id !== context.userId) {
      throw new ReviewerResponseServiceError(403, 'Only the lab coordinator can process this request');
    }
  }

  private static async upsertCompatibilityResponse(
    assignment: Assignment,
    status: ReviewerResponseStatus,
    labId: string,
    updates?: ReviewerResponseCompatibilityUpdate,
  ): Promise<ReviewerResponse> {
    const responseRepository = AppDataSource.getRepository(ReviewerResponse);
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

  private static async loadAssignmentForResponse(id: string): Promise<Assignment> {
    const assignmentRepository = AppDataSource.getRepository(Assignment);
    const assignment = await assignmentRepository.findOne({
      where: { id },
      relations: ['reviewer', 'reviewer.labs', 'round', 'round.paper', 'round.paper.labs', 'response', 'extensions'],
    });

    if (!assignment) {
      throw new ReviewerResponseServiceError(404, 'Assignment not found after update');
    }

    return assignment;
  }
}
