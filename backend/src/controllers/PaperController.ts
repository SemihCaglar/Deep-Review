import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Paper } from '../entities/Paper';
import { UserRole } from '../entities/User';
import type { AuthenticatedRequest } from '../types/auth';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { In } from 'typeorm';

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
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });
      const paperId = req.params.id as string;
      const repo = AppDataSource.getRepository(Paper);
      const paper = await repo.findOne({ 
        where: { id: paperId },
        relations: ['authors', 'rounds', 'rounds.assignments', 'rounds.assignments.reviewer']
      });

      if (!paper) {
        return res.status(404).json({ message: 'Paper not found' });
      }

      // Check authorization (author, assigned reviewer, or admin/coordinator)
      const isAuthor = paper.authors.some(a => a.id === authReq.user!.id);
      const isReviewer = paper.rounds.some(r => r.assignments.some(a => a.reviewer.id === authReq.user!.id));
      if (!isAuthor && !isReviewer && authReq.user!.role !== UserRole.Coordinator && authReq.user!.role !== UserRole.Admin) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      res.status(200).json(paper);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
  static async getMyWrittenPapers(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });
      const repo = AppDataSource.getRepository(Paper);
      const papers = await repo.find({
        where: {
          authors: { id: authReq.user.id }
        },
        relations: ['authors', 'topics']
      });
      res.status(200).json(papers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
  static async getMyReviewedPapers(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });
      const repo = AppDataSource.getRepository(Assignment);
      const assignments = await repo.find({
        where: {
          reviewer: { id: authReq.user.id },
          status: AssignmentStatus.Completed
        },
        relations: ['round', 'round.paper', 'round.paper.authors']
      });
      
      const papers = assignments.map(a => a.round.paper).filter(p => !!p);
      const uniquePapers = Array.from(new Map(papers.map(p => [p.id, p])).values());
      
      res.status(200).json(uniquePapers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
  static async getMyCurrentReviewedPapers(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return res.status(401).json({ message: 'Unauthorized' });
      const repo = AppDataSource.getRepository(Assignment);
      const assignments = await repo.find({
        where: {
          reviewer: { id: authReq.user.id },
          status: In([AssignmentStatus.Invited, AssignmentStatus.Accepted, AssignmentStatus.Overdue])
        },
        relations: ['round', 'round.paper', 'round.paper.authors']
      });
      
      const papers = assignments.map(a => a.round.paper).filter(p => !!p);
      const uniquePapers = Array.from(new Map(papers.map(p => [p.id, p])).values());
      
      res.status(200).json(uniquePapers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
