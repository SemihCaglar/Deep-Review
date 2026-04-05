import { Request, Response } from 'express';

export class RatingAnalyticsController {
  static async rateReviewer(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getOverallAnalytics(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getUserAnalytics(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
