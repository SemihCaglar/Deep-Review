import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Assignment } from '../entities/Assignment';

export class SearchController {
  static async searchPapersByTitle(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchPapersByStatus(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchPapersByVenue(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchPapersByAuthor(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchPapersByTopic(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchPapersByDateRange(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchPapersByClosed(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchPapersByArchived(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchReviewsByPaper(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchReviewsByAuthor(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchReviewsByReviewer(req: Request, res: Response) {
    const id = req.params.id;
    if (id === 'all') {
         try {
             // Let the frontend UI grab all assignments for the Coordinator stats
             const repo = AppDataSource.getRepository(Assignment);
             const reviews = await repo.find({ relations: ['reviewer'] });
             const mapMockShape = reviews.map(r => ({ ...r, reviewerId: r.reviewer?.id }));
             res.status(200).json(mapMockShape);
             return;
         } catch (e: any) { res.status(500).json({error: e.message}); return; }
    }
    try {
        const repo = AppDataSource.getRepository(Assignment);
        const reviews = await repo.find({ 
            where: { reviewer: { id: id as string } },
            relations: ['reviewer'] 
        });
        const mapMockShape = reviews.map(r => ({ ...r, reviewerId: r.reviewer?.id }));
        res.status(200).json(mapMockShape);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  }
  static async searchReviewsByStatus(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchReviewsByDeadline(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchLabMembersByName(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchLabMembersByTopic(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async searchLabMembersByWorkload(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
