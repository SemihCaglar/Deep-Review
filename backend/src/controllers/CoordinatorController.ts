import { Request, Response } from 'express';
import {
  CoordinatorDecision,
  CoordinatorService,
  CoordinatorServiceError,
} from '../services/CoordinatorService';

/**
 * Extracts coordinator ID from the request object.
 * @param req - The express request object.
 * @returns The coordinator ID or null if not found.
 */
function getCoordinatorId(req: Request): string | null {
  const requestWithUser = req as Request & { user?: { id?: string; userId?: string } };
  return requestWithUser.user?.id || requestWithUser.user?.userId || req.body?.coordinatorId || req.body?.userId || null;
}

/**
 * Extracts lab ID from the request object.
 * @param req - The express request object.
 * @returns The lab ID or null if not found.
 */
function getLabId(req: Request): string | null {
  const requestWithUser = req as Request & { user?: { labId?: string } };
  return requestWithUser.user?.labId || req.body?.labId || null;
}

/**
 * Extracts assignment ID from the request object.
 * @param req - The express request object.
 * @returns The assignment ID or null if not found.
 */
function getAssignmentId(req: Request): string | null {
  return req.params.id || req.body?.assignmentId || req.body?.responseId || null;
}

/**
 * Parses a string value into a CoordinatorDecision.
 * @param value - The value to parse.
 * @returns 'Approve', 'Reject', or null if invalid.
 */
function parseDecision(value: unknown): CoordinatorDecision | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'approve' || normalized === 'approved') {
    return 'Approve';
  }
  if (normalized === 'reject' || normalized === 'rejected') {
    return 'Reject';
  }

  return null;
}

/**
 * Standardized error handler for coordinator-related requests.
 * @param error - The error object.
 * @param res - The express response object.
 */
function handleCoordinatorError(error: unknown, res: Response) {
  if (error instanceof CoordinatorServiceError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: 'Internal server error' });
}

export class CoordinatorController {
  /**
   * Processes a decline request from a reviewer (Approve or Reject).
   * @param req - The request object.
   * @param res - The response object.
   */
  static async processDeclineRequest(req: Request, res: Response) {
    try {
      const assignmentId = getAssignmentId(req);
      const coordinatorId = getCoordinatorId(req);
      const labId = getLabId(req);
      const decision = parseDecision(req.body?.decision);

      if (!assignmentId) {
        return res.status(400).json({ message: 'Assignment id is required' });
      }
      if (!coordinatorId || !labId) {
        return res.status(400).json({ message: 'coordinatorId and labId are required' });
      }
      if (!decision) {
        return res.status(400).json({ message: "decision must be 'Approve' or 'Reject'" });
      }

      const assignment = await CoordinatorService.processDeclineRequest(
        assignmentId,
        decision,
        { coordinatorId, labId },
      );

      return res.status(200).json({
        message: decision === 'Approve' ? 'Decline request approved' : 'Decline request rejected',
        assignment,
      });
    } catch (error) {
      return handleCoordinatorError(error, res);
    }
  }

  /**
   * Processes an extension request from a reviewer (Approve or Reject).
   * @param req - The request object.
   * @param res - The response object.
   */
  static async processExtensionRequest(req: Request, res: Response) {
    try {
      const assignmentId = getAssignmentId(req);
      const coordinatorId = getCoordinatorId(req);
      const labId = getLabId(req);
      const extensionId = typeof req.body?.extensionId === 'string' ? req.body.extensionId : null;
      const decision = parseDecision(req.body?.decision);
      const newDeadline = req.body?.newDeadline ?? req.body?.approvedDeadline;

      if (!assignmentId) {
        return res.status(400).json({ message: 'Assignment id is required' });
      }
      if (!coordinatorId || !labId) {
        return res.status(400).json({ message: 'coordinatorId and labId are required' });
      }
      if (!extensionId) {
        return res.status(400).json({ message: 'extensionId is required' });
      }
      if (!decision) {
        return res.status(400).json({ message: "decision must be 'Approve' or 'Reject'" });
      }
      if (decision === 'Approve' && !newDeadline) {
        return res.status(400).json({ message: 'newDeadline is required when approving an extension request' });
      }

      const assignment = await CoordinatorService.processExtensionRequest(
        assignmentId,
        extensionId,
        decision,
        newDeadline,
        { coordinatorId, labId },
      );

      return res.status(200).json({
        message: decision === 'Approve' ? 'Extension request approved' : 'Extension request rejected',
        assignment,
      });
    } catch (error) {
      return handleCoordinatorError(error, res);
    }
  }
}
