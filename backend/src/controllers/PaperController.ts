import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Paper } from '../entities/Paper';
import { UserRole } from '../entities/User';
import type { AuthenticatedRequest } from '../types/auth';
import { PaperService } from '../services/PaperService';
import { RegisterPaperDto } from '../dtos/PaperDto';

export class PaperController {
  static async registerPaper(req: Request, res: Response) {
    try {
      const dto = req.body as RegisterPaperDto;
      
      // We leave authorId undefined for now until your teammate completes JWT.
      const authorId = undefined; // e.g. req.user?.id

      const paper = await PaperService.registerPaper(dto, authorId);

      return res.status(201).json({
        message: 'Paper successfully saved as Draft',
        paper
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
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
  static async getMyCoordinatedPapers(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const paperRepo = AppDataSource.getRepository(Paper);
      const papers = await paperRepo.find({
        where: { coordinators: { id: coordinator.id } },
        relations: ['coordinators', 'labs'],
      });

      return res.status(200).json(papers.map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        abstractText: p.abstractText,
        overleafLink: p.overleafLink ?? null,
      })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async updateOverleafLink(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinator = req.user;
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden: Action requires Coordinator role' });
      }

      const id = req.params.id as string;
      const { overleafLink } = req.body;
      if (typeof overleafLink !== 'string') {
        return res.status(400).json({ message: 'overleafLink must be a string' });
      }

      const paperRepo = AppDataSource.getRepository(Paper);
      const paper = await paperRepo.findOne({
        where: { id },
        relations: ['coordinators'],
      });
      if (!paper) return res.status(404).json({ message: 'Paper not found' });

      const isOwner = paper.coordinators?.some(c => c.id === coordinator.id);
      if (!isOwner) return res.status(403).json({ message: 'Forbidden: You are not a coordinator of this paper' });

      paper.overleafLink = overleafLink || null!;
      await paperRepo.save(paper);

      return res.status(200).json({ message: 'Overleaf link updated', overleafLink: paper.overleafLink ?? null });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
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
