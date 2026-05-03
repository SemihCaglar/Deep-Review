import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { ExtensionStatus } from '../entities/Extension';
import { Lab } from '../entities/Lab';
import { User, UserRole } from '../entities/User';
import { RoundStatus } from '../entities/Round';

export type AnalyticsPeriod = 'monthly' | 'yearly' | 'overall';

export interface UserLabStats {
  userId: string;
  name: string;
  email: string;
  totalAssigned: number;
  totalAccepted: number;
  totalCompleted: number;
  totalIncomplete: number;
  totalDeclined: number;
  acceptanceRate: number | null;
  rejectionRate: number | null;
  onTimeCompleted: number;
  delayedCompleted: number;
  onTimeRate: number | null;
  delayedRate: number | null;
  ratingCount: number;
  avgQualityScore: number | null;
  avgQuantityScore: number | null;
  avgTimeScore: number | null;
  aggregateScore: number | null;
}

export interface RankedReviewer extends UserLabStats {
  rank: number;
}

export interface LabRankingsResult {
  rankings: RankedReviewer[];
  summary: {
    period: AnalyticsPeriod;
    periodStart: string | null;
    periodEnd: string | null;
    totalReviewers: number;
    totalAssigned: number;
    totalCompleted: number;
    avgReviewerScore: number | null;
    avgAggregateScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
    totalRatingsGiven: number;
  };
}

type PeriodWindow = {
  period: AnalyticsPeriod;
  start: Date | null;
  end: Date | null;
};

/**
 * Calculates the start and end dates for a given analytics period.
 */
function getPeriodWindow(period: AnalyticsPeriod): PeriodWindow {
  const now = new Date();
  if (period === 'monthly') {
    return {
      period,
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }

  if (period === 'yearly') {
    return {
      period,
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear() + 1, 0, 1),
    };
  }

  return { period, start: null, end: null };
}

/**
 * Checks if a given date falls within a specific period window.
 */
function isWithinWindow(value: Date | string | null | undefined, window: PeriodWindow): boolean {
  if (!window.start || !window.end) return true;
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= window.start && date < window.end;
}

/**
 * Computes detailed review statistics for a specific user within a lab and period.
 * @param user - The user entity.
 * @param labId - The lab ID.
 * @param window - The time period window.
 * @returns An object containing review stats (totals, rates, scores).
 */
export async function computeUserLabStats(
  user: User,
  labId: string,
  window: PeriodWindow = getPeriodWindow('overall'),
): Promise<UserLabStats> {
  const assignmentRepo = AppDataSource.getRepository(Assignment);

  // Fetch all assignments for this reviewer on papers belonging to this lab.
  // Uses innerJoin for reviewer and lab (filter-only); leftJoinAndSelect for round
  // and rating so their data is available in the result.
  const assignments = await assignmentRepo
    .createQueryBuilder('assignment')
    .innerJoin('assignment.reviewer', 'reviewer')
    .leftJoinAndSelect('assignment.round', 'round')
    .innerJoin('round.paper', 'paper')
    .innerJoin('paper.labs', 'lab')
    .leftJoinAndSelect('assignment.rating', 'rating')
    .leftJoinAndSelect('assignment.extensions', 'extensions')
    .where('reviewer.id = :userId', { userId: user.id })
    .andWhere('lab.id = :labId', { labId })
    .getMany();

  const assignmentsInPeriod = assignments.filter(a => isWithinWindow(a.invitedAt, window));
  const completedAssignmentsInPeriod = assignments.filter(a =>
    a.status === AssignmentStatus.Completed && isWithinWindow(a.submittedAt, window),
  );
  const totalAssigned = assignmentsInPeriod.length;
  const totalAccepted = assignmentsInPeriod.filter(a => a.acceptedAt !== null).length;
  const totalCompleted = completedAssignmentsInPeriod.length;
  const totalDeclined = assignmentsInPeriod.filter(a => a.status === AssignmentStatus.Declined).length;
  const decisionTotal = totalAccepted + totalDeclined;
  const acceptanceRate = decisionTotal > 0 ? (totalAccepted / decisionTotal) * 100 : null;
  const rejectionRate = decisionTotal > 0 ? (totalDeclined / decisionTotal) * 100 : null;
  const delayedCompleted = completedAssignmentsInPeriod.filter(a => {
    const isLate = a.submittedAt && a.deadline && new Date(a.submittedAt) > new Date(a.deadline);
    const hasApprovedExtension = a.extensions?.some(ext => ext.status === ExtensionStatus.Approved) ?? false;
    return isLate || hasApprovedExtension;
  }).length;
  const onTimeCompleted = Math.max(totalCompleted - delayedCompleted, 0);
  const onTimeRate = totalCompleted > 0 ? (onTimeCompleted / totalCompleted) * 100 : null;
  const delayedRate = totalCompleted > 0 ? (delayedCompleted / totalCompleted) * 100 : null;
  // Incomplete = overdue assignments whose deadline falls in the window,
  // plus accepted assignments from rounds that completed in the window without a submission.
  const overdueAssignments = assignments.filter(
    a => a.status === AssignmentStatus.Overdue && isWithinWindow(a.deadline, window),
  );
  const acceptedAndExpiredRounds = assignments.filter(
    a =>
      a.status === AssignmentStatus.Accepted &&
      a.submittedAt == null &&
      a.round?.status === RoundStatus.Completed &&
      isWithinWindow(a.round.completedAt, window),
  );
  const totalIncomplete = overdueAssignments.length + acceptedAndExpiredRounds.length;

  const ratings = assignments
    .filter(a => a.rating != null && isWithinWindow(a.rating.createdAt, window))
    .map(a => a.rating);
  const ratingCount = ratings.length;

  let avgQualityScore: number | null = null;
  let avgQuantityScore: number | null = null;
  let avgTimeScore: number | null = null;
  let aggregateScore: number | null = null;

  if (ratingCount > 0) {
    avgQualityScore = ratings.reduce((sum, r) => sum + r.qualityScore, 0) / ratingCount;
    avgQuantityScore = ratings.reduce((sum, r) => sum + r.quantityScore, 0) / ratingCount;
    avgTimeScore = ratings.reduce((sum, r) => sum + r.timeScore, 0) / ratingCount;
    aggregateScore = (avgQualityScore + avgQuantityScore + avgTimeScore) / 3;
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    totalAssigned,
    totalAccepted,
    totalCompleted,
    totalIncomplete,
    totalDeclined,
    acceptanceRate,
    rejectionRate,
    onTimeCompleted,
    delayedCompleted,
    onTimeRate,
    delayedRate,
    ratingCount,
    avgQualityScore,
    avgQuantityScore,
    avgTimeScore,
    aggregateScore,
  };
}

/**
 * Computes lab-wide reviewer rankings for all time.
 */
export async function computeLabRankings(labId: string): Promise<LabRankingsResult> {
  return computeLabRankingsForPeriod(labId, 'overall');
}

/**
 * Computes lab-wide reviewer rankings for a specific period.
 * @param labId - The lab ID.
 * @param period - The analytics period ('monthly', 'yearly', 'overall').
 * @returns A ranked list of reviewers and a summary of lab performance.
 */
export async function computeLabRankingsForPeriod(labId: string, period: AnalyticsPeriod): Promise<LabRankingsResult> {
  const labRepo = AppDataSource.getRepository(Lab);
  const window = getPeriodWindow(period);

  const lab = await labRepo.findOne({ where: { id: labId }, relations: ['members'] });
  if (!lab) {
    throw new Error(`Lab not found: ${labId}`);
  }

  // Only LabMembers can be reviewers — Coordinators and Admins are excluded
  const reviewers = lab.members.filter(m => m.role === UserRole.LabMember);

  const allStats = await Promise.all(reviewers.map(m => computeUserLabStats(m, labId, window)));

  // Sort descending by aggregateScore; reviewers with no ratings go to the bottom
  const sorted = [...allStats].sort((a, b) => {
    if (a.aggregateScore === null && b.aggregateScore === null) return 0;
    if (a.aggregateScore === null) return 1;
    if (b.aggregateScore === null) return -1;
    return b.aggregateScore - a.aggregateScore;
  });

  const rankings: RankedReviewer[] = sorted.map((stats, idx) => ({
    ...stats,
    rank: idx + 1,
  }));

  const scoredReviewers = rankings.filter(r => r.aggregateScore !== null);
  const totalRatingsGiven = rankings.reduce((sum, r) => sum + r.ratingCount, 0);
  const totalAssigned = rankings.reduce((sum, r) => sum + r.totalAssigned, 0);
  const totalCompleted = rankings.reduce((sum, r) => sum + r.totalCompleted, 0);

  const avgAggregateScore =
    scoredReviewers.length > 0
      ? scoredReviewers.reduce((sum, r) => sum + r.aggregateScore!, 0) / scoredReviewers.length
      : null;

  const highestScore =
    scoredReviewers.length > 0 ? Math.max(...scoredReviewers.map(r => r.aggregateScore!)) : null;

  const lowestScore =
    scoredReviewers.length > 0 ? Math.min(...scoredReviewers.map(r => r.aggregateScore!)) : null;

  return {
    rankings,
    summary: {
      period,
      periodStart: window.start ? window.start.toISOString() : null,
      periodEnd: window.end ? window.end.toISOString() : null,
      totalReviewers: rankings.length,
      totalAssigned,
      totalCompleted,
      avgReviewerScore: avgAggregateScore,
      avgAggregateScore,
      highestScore,
      lowestScore,
      totalRatingsGiven,
    },
  };
}
