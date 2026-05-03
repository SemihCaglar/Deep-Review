import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { Round, RoundStatus } from '../entities/Round';

const WEIGHT_OPEN_AUTHOR_ROUND = 40;
const WEIGHT_ACTIVE_REVIEW = 30;
const WEIGHT_DRAFT_AUTHOR_ROUND = 15;
const WEIGHT_COMPLETED_LAST_MONTH = 10;

export interface WorkloadData {
  workloadPct: number;
  openAuthorRounds: number;
  activeReviewAssignments: number;
  draftAuthorRounds: number;
  completedLastMonth: number;
}

const ACTIVE_STATUSES = [
  AssignmentStatus.Invited,
  AssignmentStatus.Accepted,
  AssignmentStatus.PendingExtension,
  AssignmentStatus.PendingDecline,
  AssignmentStatus.Overdue,
];

export async function computeWorkloadBatch(userIds: string[]): Promise<Map<string, WorkloadData>> {
  const result = new Map<string, WorkloadData>();
  if (userIds.length === 0) return result;

  for (const id of userIds) {
    result.set(id, { workloadPct: 0, openAuthorRounds: 0, activeReviewAssignments: 0, draftAuthorRounds: 0, completedLastMonth: 0 });
  }

  const assignmentRepo = AppDataSource.getRepository(Assignment);
  const roundRepo = AppDataSource.getRepository(Round);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Query 1: active review assignments per user
  const activeAssignments = await assignmentRepo
    .createQueryBuilder('a')
    .select('a.reviewerId', 'userId')
    .addSelect('COUNT(*)', 'cnt')
    .where('a.reviewerId IN (:...userIds)', { userIds })
    .andWhere('a.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
    .groupBy('a.reviewerId')
    .getRawMany<{ userId: string; cnt: string }>();

  for (const row of activeAssignments) {
    const entry = result.get(row.userId);
    if (entry) entry.activeReviewAssignments = parseInt(row.cnt, 10);
  }

  // Query 2: open rounds where user is an author
  const openRounds = await roundRepo
    .createQueryBuilder('r')
    .innerJoin('r.paper', 'paper')
    .innerJoin('paper.authors', 'author')
    .select('author.id', 'userId')
    .addSelect('COUNT(DISTINCT r.id)', 'cnt')
    .where('author.id IN (:...userIds)', { userIds })
    .andWhere('r.status = :status', { status: RoundStatus.Open })
    .groupBy('author.id')
    .getRawMany<{ userId: string; cnt: string }>();

  for (const row of openRounds) {
    const entry = result.get(row.userId);
    if (entry) entry.openAuthorRounds = parseInt(row.cnt, 10);
  }

  // Query 3: draft rounds where user is an author
  const draftRounds = await roundRepo
    .createQueryBuilder('r')
    .innerJoin('r.paper', 'paper')
    .innerJoin('paper.authors', 'author')
    .select('author.id', 'userId')
    .addSelect('COUNT(DISTINCT r.id)', 'cnt')
    .where('author.id IN (:...userIds)', { userIds })
    .andWhere('r.status = :status', { status: RoundStatus.Draft })
    .groupBy('author.id')
    .getRawMany<{ userId: string; cnt: string }>();

  for (const row of draftRounds) {
    const entry = result.get(row.userId);
    if (entry) entry.draftAuthorRounds = parseInt(row.cnt, 10);
  }

  // Query 4: reviews completed in the last 30 days per user
  const completedRecently = await assignmentRepo
    .createQueryBuilder('a')
    .select('a.reviewerId', 'userId')
    .addSelect('COUNT(*)', 'cnt')
    .where('a.reviewerId IN (:...userIds)', { userIds })
    .andWhere('a.status = :status', { status: AssignmentStatus.Completed })
    .andWhere('a.submittedAt >= :since', { since: thirtyDaysAgo })
    .groupBy('a.reviewerId')
    .getRawMany<{ userId: string; cnt: string }>();

  for (const row of completedRecently) {
    const entry = result.get(row.userId);
    if (entry) entry.completedLastMonth = parseInt(row.cnt, 10);
  }

  // Compute final percentage
  for (const [, entry] of result) {
    const raw =
      entry.openAuthorRounds * WEIGHT_OPEN_AUTHOR_ROUND +
      entry.activeReviewAssignments * WEIGHT_ACTIVE_REVIEW +
      entry.draftAuthorRounds * WEIGHT_DRAFT_AUTHOR_ROUND +
      entry.completedLastMonth * WEIGHT_COMPLETED_LAST_MONTH;
    entry.workloadPct = Math.min(100, Math.max(0, Math.round(raw)));
  }

  return result;
}
