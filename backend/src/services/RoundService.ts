import { AppDataSource } from '../data-source';
import { Round, RoundStatus, VenueCategory } from '../entities/Round';
import { Paper } from '../entities/Paper';
import { DeclineRequest, DeclineRequestStatus } from '../entities/DeclineRequest';
import { Extension, ExtensionStatus } from '../entities/Extension';

export class RoundServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class RoundService {
  static async startRound(roundId: string, coordinatorId: string): Promise<Round> {
    return AppDataSource.transaction(async (manager) => {
      const roundRepo = manager.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: roundId },
        relations: ['paper', 'paper.coordinators', 'paper.authors'],
      });

      if (!round) throw new RoundServiceError(404, 'Round not found');

      const isOwner = round.paper.coordinators?.some(c => c.id === coordinatorId);
      if (!isOwner) throw new RoundServiceError(403, 'You are not a coordinator of this paper');

      if (round.status !== RoundStatus.Draft) {
        throw new RoundServiceError(400, 'Only Draft rounds can be started');
      }

      if (!round.deadline) {
        throw new RoundServiceError(400, 'Round deadline must be set before starting');
      }

      if (round.venueCategory === VenueCategory.Conference && !round.submissionDeadline) {
        throw new RoundServiceError(400, 'Submission deadline is required for Conference rounds');
      }

      if (!round.paper.overleafLink) {
        throw new RoundServiceError(400, 'The paper\'s Overleaf link must be set before starting a round');
      }

      round.status = RoundStatus.Open;
      round.startedAt = new Date();

      return roundRepo.save(round);
    });
  }

  static async checkAndMarkOverdue(): Promise<void> {
    const now = new Date();

    await AppDataSource.transaction(async (manager) => {
      const roundRepo = manager.getRepository(Round);

      const openRounds = await roundRepo.find({
        where: { status: RoundStatus.Open },
        relations: ['assignments'],
      });

      for (const round of openRounds) {
        for (const assignment of round.assignments ?? []) {
          const isActive = ['Invited', 'Accepted', 'PendingExtension', 'PendingDecline'].includes(assignment.status);
          const isPastDeadline = assignment.deadline && assignment.deadline.getTime() < now.getTime();

          if (isActive && isPastDeadline) {
            assignment.status = 'Overdue' as any;
            await manager.getRepository('Assignment').save(assignment);

            // Reject any pending decline/extension requests — coordinator didn't act in time
            await manager.getRepository(DeclineRequest).update(
              { assignment: { id: assignment.id }, status: DeclineRequestStatus.Pending },
              { status: DeclineRequestStatus.Rejected },
            );
            await manager.getRepository(Extension).update(
              { assignment: { id: assignment.id }, status: ExtensionStatus.Pending },
              { status: ExtensionStatus.Rejected },
            );
          }
        }

        if (round.assignments.length > 0) {
          const terminalStatuses = new Set(['Declined', 'Cancelled', 'Reassigned', 'Completed', 'Overdue']);
          const allTerminal = round.assignments.every(a => terminalStatuses.has(a.status));

          if (allTerminal) {
            round.status = RoundStatus.Completed;
            round.completedAt = now;
            await roundRepo.save(round);
          }
        }
      }
    });
  }

}
