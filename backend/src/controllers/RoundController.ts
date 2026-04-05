import { Request, Response } from 'express';

export class RoundController {
  static async createReviewRound(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async editRoundDeadline(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async suggestReviewers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async addProposeReviewer(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getProposeReviewers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async trackReviewStatus(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async alertOverdueReviews(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async closeRound(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async startNextRound(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async startAIReview(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async addChecklistItem(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async removeChecklistItem(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateChecklistItem(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
