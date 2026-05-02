import { AppDataSource } from '../data-source';
import { Round, RoundStatus, VenueCategory } from '../entities/Round';
import { Paper, PaperStatus } from '../entities/Paper';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { User, UserRole } from '../entities/User';
import { DeclineRequest, DeclineRequestStatus } from '../entities/DeclineRequest';
import { Extension, ExtensionStatus } from '../entities/Extension';
import { SubmissionRuleSet } from '../entities/SubmissionRuleSet';
import { sendEmail } from './emailService';
import { SubmissionRuleExtractionService } from '../ai_content/services/SubmissionRuleExtractionService';
import { EntityManager, In, Not } from 'typeorm';

export class RoundServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class RoundService {
  private static readonly terminalAssignmentStatuses = [
    AssignmentStatus.Declined,
    AssignmentStatus.Cancelled,
    AssignmentStatus.Reassigned,
    AssignmentStatus.Completed,
    AssignmentStatus.Overdue,
  ];

  private static hasOverleafLink(paper: Paper): boolean {
    return typeof paper.overleafLink === 'string' && paper.overleafLink.trim().length > 0;
  }

  private static async extractAndLinkSubmissionRules(venueUrl: string | null): Promise<string | null> {
    if (!venueUrl || typeof venueUrl !== 'string') {
      return null;
    }

    try {
      console.log(`[RoundService] Attempting to extract rules for: ${venueUrl}`);
      const rules = await SubmissionRuleExtractionService.extractSubmissionRules(venueUrl);

      // Get the rule set ID from the database
      const ruleSetRepo = AppDataSource.getRepository(SubmissionRuleSet);
      const ruleSet = await ruleSetRepo.findOne({ where: { sourceUrl: venueUrl } });

      if (ruleSet) {
        console.log(`[RoundService] Successfully linked rules with ID: ${ruleSet.id}`);
        return ruleSet.id;
      }

      return null;
    } catch (error) {
      // Gracefully handle extraction failures - don't fail the round creation
      console.warn(`[RoundService] Failed to extract submission rules for ${venueUrl}:`, error);
      return null;
    }
  }

  static async extractAndLinkRules(roundId: string, venueUrl: string): Promise<void> {
    try {
      const ruleSetId = await this.extractAndLinkSubmissionRules(venueUrl);
      if (ruleSetId) {
        const roundRepo = AppDataSource.getRepository(Round);
        await roundRepo.update(roundId, { submissionRuleSetId: ruleSetId });
        console.log(`[RoundService] Round ${roundId} linked to rules ${ruleSetId}`);
      }
    } catch (error) {
      console.error(`[RoundService] Error in extractAndLinkRules for round ${roundId}:`, error);
    }
  }

  static async completeRoundIfAllAssignmentsTerminal(
    roundId: string,
    manager: EntityManager = AppDataSource.manager,
  ): Promise<boolean> {
    const roundRepo = manager.getRepository(Round);
    const round = await roundRepo.findOne({
      where: { id: roundId },
    });

    if (!round || round.status !== RoundStatus.Open) {
      return false;
    }

    const assignmentRepo = manager.getRepository(Assignment);
    const totalAssignments = await assignmentRepo.count({
      where: { round: { id: roundId } },
    });

    if (totalAssignments === 0) {
      return false;
    }

    const nonTerminalAssignments = await assignmentRepo.count({
      where: {
        round: { id: roundId },
        status: Not(In(this.terminalAssignmentStatuses)),
      },
    });

    if (nonTerminalAssignments > 0) {
      return false;
    }

    await roundRepo.update(roundId, {
      status: RoundStatus.Completed,
      completedAt: new Date(),
    });
    return true;
  }

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
        throw new RoundServiceError(400, `Cannot start round: it is currently '${round.status}'. Only Draft rounds can be started.`);
      }

      if (!round.deadline) {
        throw new RoundServiceError(400, 'Round deadline must be set before starting. Please set a review deadline first.');
      }

      if (round.venueCategory === VenueCategory.Conference && !round.submissionDeadline) {
        throw new RoundServiceError(400, 'This is a Conference round — a submission deadline is required before starting.');
      }

      if (!this.hasOverleafLink(round.paper)) {
        throw new RoundServiceError(400, 'The paper\'s Overleaf link must be set before starting a round so reviewers can access the manuscript.');
      }

      if (!round.targetVenueUrl?.trim()) {
        throw new RoundServiceError(400, 'The venue URL must be set before starting the round. Please add the target venue URL first.');
      }

      round.status = RoundStatus.Open;
      round.startedAt = new Date();

      return roundRepo.save(round);
    });
  }

  static async approveRound(roundId: string, coordinatorId: string): Promise<{ round: Round; assigned: number; skipped: number }> {
    return AppDataSource.transaction(async (manager) => {
      const roundRepo = manager.getRepository(Round);
      const round = await roundRepo.findOne({
        where: { id: roundId },
        relations: [
          'paper', 'paper.coordinators', 'paper.authors', 'paper.labs',
          'proposedReviewers', 'proposedReviewers.labs',
          'assignments', 'assignments.reviewer',
        ],
      });

      if (!round) throw new RoundServiceError(404, 'Round not found');

      const isOwner = round.paper.coordinators?.some(c => c.id === coordinatorId);
      if (!isOwner) throw new RoundServiceError(403, 'You are not a coordinator of this paper');

      if (round.status !== RoundStatus.Draft) {
        throw new RoundServiceError(400, `Cannot approve round: it is currently '${round.status}'. Only Draft rounds can be approved and started.`);
      }
      if (!round.deadline) {
        throw new RoundServiceError(400, 'A review deadline must be set on the round before it can be approved. Please set a deadline first.');
      }
      if (round.venueCategory === VenueCategory.Conference && !round.submissionDeadline) {
        throw new RoundServiceError(400, 'This is a Conference round — a submission deadline is required before the round can be approved.');
      }
      if (!this.hasOverleafLink(round.paper)) {
        throw new RoundServiceError(400, 'The paper\'s Overleaf link must be set before approving so reviewers can access the manuscript.');
      }

      if (!round.targetVenueUrl?.trim()) {
        throw new RoundServiceError(400, 'The venue URL must be set before approving the round. Please add the target venue URL first.');
      }

      if ((!round.proposedReviewers || round.proposedReviewers.length === 0) && (!round.assignments || round.assignments.length === 0)) {
        throw new RoundServiceError(400, 'At least one reviewer must be assigned or proposed before approving. Add reviewers from the suggestions panel first.');
      }

      const paperLabIds = round.paper.labs?.map(l => l.id) ?? [];
      const authorIds = new Set(round.paper.authors?.map(a => a.id) ?? []);
      const alreadyAssignedIds = new Set(round.assignments?.map(a => a.reviewer.id) ?? []);

      const assignRepo = manager.getRepository(Assignment);
      let assigned = 0;
      let skipped = 0;

      for (const reviewer of round.proposedReviewers) {
        // Skip admins/coordinators
        if (reviewer.role === UserRole.Admin || reviewer.role === UserRole.Coordinator) { skipped++; continue; }
        // Skip authors
        if (authorIds.has(reviewer.id)) { skipped++; continue; }
        // Skip already assigned
        if (alreadyAssignedIds.has(reviewer.id)) { skipped++; continue; }
        // Skip if not in a shared lab
        const reviewerLabIds = (reviewer as User & { labs?: { id: string }[] }).labs?.map(l => l.id) ?? [];
        const sharesLab = reviewerLabIds.some(lid => paperLabIds.includes(lid));
        if (!sharesLab) { skipped++; continue; }

        const assignment = new Assignment();
        assignment.round = round;
        assignment.reviewer = reviewer as any;
        assignment.status = AssignmentStatus.Invited;
        assignment.deadline = round.deadline;
        assignment.invitationSent = true;
        await assignRepo.save(assignment);

        await sendEmail(
          reviewer,
          'You have been invited to review a paper',
          `Hello ${reviewer.name},\n\nYou have been invited to review the paper "${round.paper.title}" (Round ${round.roundNumber}).\n\nPlease log in to accept or decline.\n\nDeadline: ${round.deadline?.toISOString().split('T')[0] ?? 'TBD'}`,
        ).catch(err => console.error('[approveRound] invite email failed:', err));

        assigned++;
      }

      const pendingExistingInvitations = (round.assignments ?? []).filter(
        assignment => assignment.status === AssignmentStatus.Invited && !assignment.invitationSent,
      );

      for (const assignment of pendingExistingInvitations) {
        assignment.invitationSent = true;
        await assignRepo.save(assignment);

        await sendEmail(
          assignment.reviewer,
          'You have been invited to review a paper',
          `Hello ${assignment.reviewer.name},\n\nYou have been invited to review the paper "${round.paper.title}" (Round ${round.roundNumber}).\n\nPlease log in to accept or decline.\n\nDeadline: ${assignment.deadline?.toISOString().split('T')[0] ?? 'TBD'}`,
        ).catch(err => console.error('[approveRound] existing invite email failed:', err));

        assigned++;
      }

      // Transition paper to HumanReview
      if (assigned > 0 && round.paper.status !== PaperStatus.HumanReview) {
        const paperRepo = manager.getRepository(Paper);
        await paperRepo.update(round.paper.id, { status: PaperStatus.HumanReview });
      }

      const startedAt = new Date();
      await roundRepo.update(round.id, { status: RoundStatus.Open, startedAt });
      round.status = RoundStatus.Open;
      round.startedAt = startedAt;

      return { round, assigned, skipped };
    });
  }

  static async checkAndMarkOverdue(): Promise<void> {
    const now = new Date();

    const assignRepo = AppDataSource.getRepository(Assignment);

    const activeStatuses = [
      AssignmentStatus.Invited,
      AssignmentStatus.Accepted,
      AssignmentStatus.PendingExtension,
      AssignmentStatus.PendingDecline,
    ];

    const allOverdue = await assignRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.round', 'round')
      .leftJoinAndSelect('round.paper', 'paper')
      .leftJoinAndSelect('paper.coordinators', 'coordinators')
      .leftJoinAndSelect('a.reviewer', 'reviewer')
      .where('a.deadline < :now', { now })
      .andWhere('a.status IN (:...statuses)', { statuses: activeStatuses })
      .getMany();

    const affectedRoundIds = new Set<string>();

    for (const assignment of allOverdue) {
      assignment.status = AssignmentStatus.Overdue;
      await assignRepo.save(assignment);
      if (assignment.round?.id) affectedRoundIds.add(assignment.round.id);

      await AppDataSource.getRepository(DeclineRequest).update(
        { assignment: { id: assignment.id }, status: DeclineRequestStatus.Pending },
        { status: DeclineRequestStatus.Rejected },
      );
      await AppDataSource.getRepository(Extension).update(
        { assignment: { id: assignment.id }, status: ExtensionStatus.Pending },
        { status: ExtensionStatus.Rejected },
      );

      const paper = assignment.round?.paper;
      const reviewer = assignment.reviewer;
      const paperTitle = paper?.title ?? 'Unknown Paper';
      const roundNumber = assignment.round?.roundNumber ?? '?';

      // Alert coordinator(s)
      for (const coordinator of paper?.coordinators ?? []) {
        await sendEmail(
          coordinator,
          `Overdue Review Alert: ${paperTitle}`,
          `Hello ${coordinator.name},\n\nReviewer ${reviewer.name} (${reviewer.email}) has missed their review deadline for paper "${paperTitle}" (Round ${roundNumber}).\n\nDeadline was: ${assignment.deadline?.toISOString() ?? 'N/A'}\n\nPlease consider reassigning or taking action.`,
        ).catch(err => console.error('[overdueAlert] coordinator email failed:', err));
      }

      // Notify reviewer
      await sendEmail(
        reviewer,
        `Your review for "${paperTitle}" is now Overdue`,
        `Hello ${reviewer.name},\n\nYour review assignment for paper "${paperTitle}" (Round ${roundNumber}) has passed its deadline and is now marked as Overdue.\n\nDeadline was: ${assignment.deadline?.toISOString() ?? 'N/A'}\n\nPlease contact the coordinator if you need assistance.`,
      ).catch(err => console.error('[overdueAlert] reviewer email failed:', err));
    }

    for (const roundId of affectedRoundIds) {
      await this.completeRoundIfAllAssignmentsTerminal(roundId);
    }
  }

  static async sendAutoReminders(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000); // now + 25 hours

    const eligibleStatuses = [
      AssignmentStatus.Accepted,
      AssignmentStatus.PendingExtension,
      AssignmentStatus.PendingDecline,
    ];

    const assignRepo = AppDataSource.getRepository(Assignment);
    const due = await assignRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.round', 'round')
      .leftJoinAndSelect('round.paper', 'paper')
      .leftJoinAndSelect('a.reviewer', 'reviewer')
      .where('a.deadline > :now', { now })
      .andWhere('a.deadline <= :windowEnd', { windowEnd })
      .andWhere('a.status IN (:...statuses)', { statuses: eligibleStatuses })
      .andWhere('a.autoReminderSentAt IS NULL')
      .getMany();

    for (const assignment of due) {
      const paperTitle = assignment.round?.paper?.title ?? 'Unknown Paper';
      const deadline = assignment.deadline?.toISOString().split('T')[0] ?? 'N/A';

      const emailSent = await sendEmail(
        assignment.reviewer,
        `Reminder: Review due tomorrow for "${paperTitle}"`,
        `Hello ${assignment.reviewer.name},\n\nThis is a reminder that your review for paper "${paperTitle}" is due on ${deadline}.\n\nPlease log in and submit your review before the deadline.`,
      )
        .then(() => true)
        .catch(err => {
          console.error('[autoReminder] email failed:', err);
          return false;
        });

      if (!emailSent) {
        continue;
      }
      assignment.autoReminderSentAt = now;
      await assignRepo.save(assignment);
    }
  }
}
