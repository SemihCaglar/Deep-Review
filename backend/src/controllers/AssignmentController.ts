import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { Round } from '../entities/Round';
import { User, UserRole } from '../entities/User';

export class AssignmentController {
  static async assignReviewers(req: Request, res: Response) {
    try {
      const { roundId, reviewerIds, coordinatorId } = req.body;
      
      if (!roundId || !reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0 || !coordinatorId) {
        return res.status(400).json({ message: 'Missing roundId, coordinatorId or valid reviewerIds array' });
      }

      const userRepo = AppDataSource.getRepository<User>('User');
      const coordinator = await userRepo.findOne({ where: { id: coordinatorId } });
      if (!coordinator || coordinator.role !== UserRole.Coordinator) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({ 
        where: { id: roundId },
        relations: ['paper', 'paper.authors']
      });
      if (!round) return res.status(404).json({ message: 'Round not found' });

      const authorIds = new Set(round.paper.authors?.map(a => a.id) || []);
      const assignRepo = AppDataSource.getRepository(Assignment);
      const newAssignments = [];

      for (const rId of reviewerIds) {
        const reviewer = await userRepo.findOne({ where: { id: rId } });
        if (!reviewer) continue;

        if (authorIds.has(rId)) continue;

        const exists = await assignRepo.findOne({ where: { round: { id: roundId }, reviewer: { id: rId } } });
        if (exists) continue;

        const assignment = new Assignment();
        assignment.round = round;
        assignment.reviewer = reviewer;
        assignment.status = AssignmentStatus.Invited;
        
        newAssignments.push(assignment);
      }

      if (newAssignments.length > 0) {
        await assignRepo.save(newAssignments);
        return res.status(201).json(newAssignments.map(a => ({ id: a.id, status: a.status })));
      }

      return res.status(200).json({ message: 'No new assignments created' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
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
