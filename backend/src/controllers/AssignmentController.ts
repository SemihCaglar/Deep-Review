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
}
