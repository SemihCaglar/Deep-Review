import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { Summary } from '../entities/Summary';
import { CoordinatorController } from './CoordinatorController';
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

function getSummaryText(req: Request): string | null {
  const summary = req.body?.summary ?? req.body?.text;
  return typeof summary === 'string' && summary.trim().length > 0 ? summary.trim() : null;
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
      const declineReason =
        typeof req.body?.declineReason === 'string'
          ? req.body.declineReason
          : typeof req.body?.reason === 'string'
            ? req.body.reason
            : '';

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

  static async requestExtensionForAssignment(req: Request, res: Response) {
    try {
      const id = getResponseId(req);
      const userId = getRequestUserId(req);
      const labId = getRequestLabId(req);
      const extensionReason =
        typeof req.body?.reason === 'string'
          ? req.body.reason
          : typeof req.body?.extensionReason === 'string'
            ? req.body.extensionReason
            : '';
      const proposedDeadline = req.body?.proposedDeadline ?? req.body?.requestedDeadline;

      if (!id) {
        return res.status(400).json({ message: 'Response or assignment id is required' });
      }
      if (!userId || !labId) {
        return res.status(400).json({ message: 'userId and labId are required' });
      }

      const assignment = await ReviewerResponseService.requestExtension(
        id,
        extensionReason,
        proposedDeadline,
        { userId, labId },
      );
      return res.status(200).json({ message: 'Extension request submitted', assignment });
    } catch (error) {
      return handleReviewerResponseError(error, res);
    }
  }

  static async respondToInvitation(req: Request, res: Response) {
    const response = req.body?.response;

    if (response === 'decline') {
      return ReviewerResponseController.requestDeclineForAssignment(req, res);
    }

    return ReviewerResponseController.acceptInvitation(req, res);
  }

  static async requestDecline(req: Request, res: Response) {
    return ReviewerResponseController.requestDeclineForAssignment(req, res);
  }

  static async requestDeadlineExtension(req: Request, res: Response) {
    return ReviewerResponseController.requestExtensionForAssignment(req, res);
  }

  static async processDeclineRequest(req: Request, res: Response) {
    return CoordinatorController.processDeclineRequest(req, res);
  }

  static async processExtensionRequest(req: Request, res: Response) {
    return CoordinatorController.processExtensionRequest(req, res);
  }

  static async submitReviewSummary(req: Request, res: Response) {
    try {
      const id = getResponseId(req);
      const userId = getRequestUserId(req);
      const summaryText = getSummaryText(req);

      if (!id) {
        return res.status(400).json({ message: 'Response or assignment id is required' });
      }
      if (!userId) {
        return res.status(400).json({ message: 'userId is required' });
      }
      if (!summaryText) {
        return res.status(400).json({ message: 'summary is required' });
      }

      const assignmentRepository = AppDataSource.getRepository(Assignment);
      const assignment = await assignmentRepository.findOne({
        where: { id },
        relations: ['reviewer'],
      });

      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }
      if (assignment.reviewer.id !== userId) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }

      const summaryRepository = AppDataSource.getRepository(Summary);
      const summary = summaryRepository.create({ assignment, text: summaryText });
      const savedSummary = await summaryRepository.save(summary);

      return res.status(201).json({ message: 'Review summary submitted', summary: savedSummary });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async completeReview(req: Request, res: Response) {
    try {
      const id = getResponseId(req);
      const userId = getRequestUserId(req);
      const summaryText = getSummaryText(req);

      if (!id) {
        return res.status(400).json({ message: 'Response or assignment id is required' });
      }
      if (!userId) {
        return res.status(400).json({ message: 'userId is required' });
      }

      const assignmentRepository = AppDataSource.getRepository(Assignment);
      const assignment = await assignmentRepository.findOne({
        where: { id },
        relations: ['reviewer'],
      });

      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }
      if (assignment.reviewer.id !== userId) {
        return res.status(403).json({ message: 'Forbidden: This assignment is not assigned to you' });
      }
      if (assignment.status !== AssignmentStatus.Accepted) {
        return res.status(400).json({ message: 'Assignment must be Accepted before it can be completed' });
      }

      if (summaryText) {
        const summaryRepository = AppDataSource.getRepository(Summary);
        const summary = summaryRepository.create({ assignment, text: summaryText });
        await summaryRepository.save(summary);
      }

      assignment.status = AssignmentStatus.Completed;
      assignment.submittedAt = new Date();
      const savedAssignment = await assignmentRepository.save(assignment);

      return res.status(200).json({ message: 'Review completed', assignment: savedAssignment });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async markReviewCompleted(req: Request, res: Response) {
    return ReviewerResponseController.completeReview(req, res);
  }
}
