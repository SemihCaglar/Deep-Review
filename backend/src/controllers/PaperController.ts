import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Paper } from '../entities/Paper';
import { PaperService } from '../services/PaperService';
import { RegisterPaperDto } from '../dtos/PaperDto';
import { AuthenticatedRequest } from '../types/auth';

export class PaperController {
  static async registerPaper(req: AuthenticatedRequest, res: Response) {
    try {
      const dto = req.body as RegisterPaperDto;
      const creator = req.user;

      if (!creator) {
          return res.status(401).json({ message: 'Authentication required' });
      }

      if (!dto.title || !dto.abstractText || !dto.targetVenue || !dto.topics || !Array.isArray(dto.topics) || dto.topics.length === 0) {
          return res.status(400).json({ message: 'Missing required fields' });
      }

      const paper = await PaperService.registerPaper(dto, creator);

      return res.status(201).json({
        message: 'Paper successfully saved as Draft',
        paper
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }
  static async getPaperById(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.getPaperById(id);
        if (!paper) {
            return res.status(404).json({ message: 'Paper not found' });
        }
        res.status(200).json(paper);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  }
  static async setTopics(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        const { topics } = req.body;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.updateTopics(id, topics);
        res.status(200).json(paper);
    } catch (e: any) {
        if (e.message === 'Paper not found') {
            return res.status(404).json({ message: e.message });
        }
        res.status(500).json({ error: e.message });
    }
  }
  static async uploadManuscript(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async linkParentPapers(req: Request, res: Response) {
    res.status(501).json({ message: 'Not Implemented' });
  }
  static async updateAbstract(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        const { abstract } = req.body;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.updateAbstract(id, abstract);
        res.status(200).json(paper);
    } catch (e: any) {
        if (e.message === 'Paper not found') {
            return res.status(404).json({ message: e.message });
        }
        res.status(500).json({ error: e.message });
    }
  }
  static async updateTopics(req: Request<{ id: string }>, res: Response) {
    try {
        const { id } = req.params;
        const { topics } = req.body;
        if (!id) return res.status(400).json({ message: 'Missing paper ID' });
        const paper = await PaperService.updateTopics(id, topics);
        res.status(200).json(paper);
    } catch (e: any) {
        if (e.message === 'Paper not found') {
            return res.status(404).json({ message: e.message });
        }
        res.status(500).json({ error: e.message });
    }
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
