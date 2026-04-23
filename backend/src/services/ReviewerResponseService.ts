import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
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
      trimmedReason,
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
      relations: ['reviewer', 'reviewer.labs', 'round', 'round.paper', 'round.paper.labs', 'response'],
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

  private static async upsertCompatibilityResponse(
    assignment: Assignment,
    status: ReviewerResponseStatus,
    labId: string,
    declineReason?: string,
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
    if (declineReason !== undefined) {
      response.declineReason = declineReason;
    }

    return responseRepository.save(response);
  }

  private static async loadAssignmentForResponse(id: string): Promise<Assignment> {
    const assignmentRepository = AppDataSource.getRepository(Assignment);
    const assignment = await assignmentRepository.findOne({
      where: { id },
      relations: ['reviewer', 'reviewer.labs', 'round', 'round.paper', 'round.paper.labs', 'response'],
    });

    if (!assignment) {
      throw new ReviewerResponseServiceError(404, 'Assignment not found after update');
    }

    return assignment;
  }
}
