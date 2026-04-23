import { Request, Response } from 'express';
import { AssignmentController } from './AssignmentController';
import {
  ReviewerResponseService,
  ReviewerResponseServiceError,
} from '../services/ReviewerResponseService';

function getRequestUserId(req: Request): string | null {
  const requestWithUser = req as Request & { user?: { id?: string; userId?: string } };
  return requestWithUser.user?.id || requestWithUser.user?.userId || req.body?.userId || null;
}

function getRequestLabId(req: Request): string | null {
  const requestWithUser = req as Request & { user?: { labId?: string } };
  return requestWithUser.user?.labId || req.body?.labId || null;
}

function getResponseId(req: Request): string | null {
  return req.params.id || req.body?.assignmentId || req.body?.responseId || null;
}

function handleReviewerResponseError(error: unknown, res: Response) {
  if (error instanceof ReviewerResponseServiceError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: 'Internal server error' });
}

export class ReviewerResponseController {
  static async acceptInvitation(req: Request, res: Response) {
    try {
      const id = getResponseId(req);
      const userId = getRequestUserId(req);
      const labId = getRequestLabId(req);

      if (!id) {
        return res.status(400).json({ message: 'Response or assignment id is required' });
      }
      if (!userId || !labId) {
        return res.status(400).json({ message: 'userId and labId are required' });
      }

      const assignment = await ReviewerResponseService.acceptAssignment(id, { userId, labId });
      return res.status(200).json({ message: 'Invitation accepted', assignment });
    } catch (error) {
      return handleReviewerResponseError(error, res);
    }
  }

  static async requestDeclineForAssignment(req: Request, res: Response) {
    try {
      const id = getResponseId(req);
      const userId = getRequestUserId(req);
      const labId = getRequestLabId(req);
      const declineReason = typeof req.body?.declineReason === 'string' ? req.body.declineReason : '';

      if (!id) {
        return res.status(400).json({ message: 'Response or assignment id is required' });
      }
      if (!userId || !labId) {
        return res.status(400).json({ message: 'userId and labId are required' });
      }

      const assignment = await ReviewerResponseService.requestDecline(id, declineReason, { userId, labId });
      return res.status(200).json({ message: 'Decline request submitted', assignment });
    } catch (error) {
      return handleReviewerResponseError(error, res);
    }
  }

  static async respondToInvitation(req: Request, res: Response) {
    return ReviewerResponseController.acceptInvitation(req, res);
  }
  static async requestDecline(req: Request, res: Response) {
    return ReviewerResponseController.requestDeclineForAssignment(req, res);
  }
  static async requestDeadlineExtension(req: Request, res: Response) {
    return AssignmentController.requestDeadlineExtension(req, res);
  }
  static async processDeclineRequest(req: Request, res: Response) {
    return AssignmentController.processDeclineRequest(req, res);
  }
  static async processExtensionRequest(req: Request, res: Response) {
    return AssignmentController.processExtensionRequest(req, res);
  }
  static async submitReviewSummary(req: Request, res: Response) {
    return AssignmentController.submitReviewSummary(req, res);
  }
  static async markReviewCompleted(req: Request, res: Response) {
    return AssignmentController.markReviewCompleted(req, res);
  }
}
