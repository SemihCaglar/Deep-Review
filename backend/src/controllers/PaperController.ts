import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Paper } from '../entities/Paper';

export class PaperController {
  static async registerPaper(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async setTopics(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async uploadManuscript(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async linkParentPapers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateAbstract(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateTopics(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getPaperStatus(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getPaperHistory(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getMyWrittenPapers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getMyReviewedPapers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getMyCurrentReviewedPapers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async getAllPapers(req: Request, res: Response) {
    try {
        const repo = AppDataSource.getRepository(Paper);
        const papers = await repo.find({ relations: ['authors'] });
        const mapMockShape = papers.map(p => ({ ...p, authors: p.authors ? p.authors.map(a => a.id) : [] }));
        res.status(200).json(mapMockShape);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  }
  static async updatePaperStatus(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}
