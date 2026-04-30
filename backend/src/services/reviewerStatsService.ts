import { AppDataSource } from '../data-source';
import { Assignment, AssignmentStatus } from '../entities/Assignment';
import { Lab } from '../entities/Lab';
import { User, UserRole } from '../entities/User';
import { RoundStatus } from '../entities/Round';

export interface UserLabStats {
  userId: string;
  name: string;
  email: string;
  totalAssigned: number;
  totalCompleted: number;
  totalIncomplete: number;
  totalDeclined: number;
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
    totalReviewers: number;
    avgAggregateScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
    totalRatingsGiven: number;
  };
}

export async function computeUserLabStats(user: User, labId: string): Promise<UserLabStats> {
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
    .where('reviewer.id = :userId', { userId: user.id })
    .andWhere('lab.id = :labId', { labId })
    .getMany();

  const totalAssigned = assignments.length;
  const totalCompleted = assignments.filter(a => a.status === AssignmentStatus.Completed).length;
  const totalDeclined = assignments.filter(a => a.status === AssignmentStatus.Declined).length;
  // Incomplete = Overdue, or Accepted while the round is already Closed
  const totalIncomplete = assignments.filter(
    a =>
      a.status === AssignmentStatus.Overdue ||
      (a.status === AssignmentStatus.Accepted && a.round?.status === RoundStatus.Completed),
  ).length;

  const ratings = assignments.filter(a => a.rating != null).map(a => a.rating);
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
    totalCompleted,
    totalIncomplete,
    totalDeclined,
    ratingCount,
    avgQualityScore,
    avgQuantityScore,
    avgTimeScore,
    aggregateScore,
  };
}

export async function computeLabRankings(labId: string): Promise<LabRankingsResult> {
  const labRepo = AppDataSource.getRepository(Lab);

  const lab = await labRepo.findOne({ where: { id: labId }, relations: ['members'] });
  if (!lab) {
    throw new Error(`Lab not found: ${labId}`);
  }

  // Only LabMembers can be reviewers — Coordinators and Admins are excluded
  const reviewers = lab.members.filter(m => m.role === UserRole.LabMember);

  const allStats = await Promise.all(reviewers.map(m => computeUserLabStats(m, labId)));

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
      totalReviewers: rankings.length,
      avgAggregateScore,
      highestScore,
      lowestScore,
      totalRatingsGiven,
    },
  };
}
