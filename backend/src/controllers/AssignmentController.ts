import { Request, Response } from 'express';

export class AssignmentController {
  static async assignReviewers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async sendInvitations(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async sendReminders(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async cancelAssignment(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateAssignmentDeadline(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
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
