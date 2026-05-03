import { Response } from 'express';
import { AppDataSource } from '../data-source';
import { Round } from '../entities/Round';
import { ReferenceListVerificationService } from '../ai_content/services/ReferenceListVerificationService';
import type { AuthenticatedRequest } from '../types/auth';

export class AIController {
  static async runReferenceVerification(req: AuthenticatedRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const user = req.user;

      console.log(`[AIController] runReferenceVerification called for round ${id} by user ${user?.id}`);

      if (!user) {
        console.warn(`[AIController] Unauthorized attempt (no user)`);
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const file = (req as any).file;
      if (!file || !file.buffer) {
        console.warn(`[AIController] No PDF file provided for round ${id}`);
        return res.status(400).json({ message: 'No PDF file uploaded.' });
      }

      if (file.buffer.length === 0) {
        console.warn(`[AIController] Empty PDF buffer for round ${id}`);
        return res.status(400).json({ message: 'PDF buffer is empty.' });
      }

      console.log(`[AIController] PDF file received: ${file.originalname} (${file.buffer.length} bytes)`);

      const roundRepo = AppDataSource.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id },
        relations: ['paper', 'paper.authors', 'paper.coordinators'],
      });

      if (!round) {
        console.warn(`[AIController] Round ${id} not found`);
        return res.status(404).json({ message: 'Round not found.' });
      }

      const isAuthor = round.paper.authors?.some((a) => a.id === user.id);
      const isCoordinator = round.paper.coordinators?.some((c) => c.id === user.id);

      if (!isAuthor && !isCoordinator) {
        console.warn(`[AIController] User ${user.id} not authorized for round ${id}`);
        return res.status(403).json({ message: 'Forbidden.' });
      }

      console.log(`[AIController] User ${user.id} authorized. Starting reference verification...`);
      const report = await ReferenceListVerificationService.verify(file.buffer);

      round.referenceVerificationReport = report;
      await roundRepo.save(round);

      console.log(`[AIController] ✓ Reference verification saved to round ${id}`);

      return res.status(200).json({
        message: 'Reference verification completed.',
        data: report,
      });
    } catch (err: any) {
      console.error('[AIController] Error in runReferenceVerification:', err);
      return res.status(500).json({ message: err.message || 'Internal server error.' });
    }
  }
}
