'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Snowflake,
  Trash2,
  UserCheck,
  BarChart2,
  Search,
  ChevronDown,
  ChevronUp,
  type LucideIcon
} from 'lucide-react';
import {
  ApiError,
  dismissRequestDecisionsRequest,
  getMyCoordinatedPapersRequest,
  getMyAssignmentsRequest,
  getPaperRoundsRequest,
  getPendingSignupsRequest,
  getOverallAnalyticsRequest,
  getPendingCollaborationInvitationsRequest,
  type OverallAnalyticsResponse,
  type MyAssignment,
  type ReviewerRanking,
  type PendingCollaborationInvitation,
} from '@/lib/api';
import { useUser } from '@/components/context/UserContext';

// --- Types & Helpers ---

type PendingReviewerRequest = {
  id: string;
  type: 'Decline' | 'Extension';
  paperId: string;
  paperTitle: string;
  roundNumber: number;
  reviewerName: string;
  reason: string;
};

type PendingRoundStartRequest = {
  id: string;
  paperId: string;
  paperTitle: string;
  roundNumber: number;
  targetVenue: string;
  venueCategory: string;
  deadline: string | null;
};

type ReviewerRequestDecision = {
  id: string;
  type: 'Decline' | 'Extension';
  status: 'Approved' | 'Rejected';
  paperTitle: string;
  roundNumber: number;
  reason: string;
  requestedDeadline?: string;
  approvedDeadline?: string | null;
  requestedAt: string;
};

type DashboardStat = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  href?: string;
};

type SortKey =
  | 'aggregateScore'
  | 'avgQualityScore'
  | 'avgQuantityScore'
  | 'avgTimeScore'
  | 'totalCompleted'
  | 'totalIncomplete'
  | 'totalDeclined';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatScore(value: number | null): string {
  return value !== null ? value.toFixed(2) : '–';
}

function SortButton({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === currentKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center justify-end gap-1 w-full text-xs font-semibold uppercase tracking-wide transition-colors ${
        isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
      {isActive ? (
        direction === 'desc' ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronUp className="w-3 h-3 shrink-0" />
      ) : (
        <ChevronDown className="w-3 h-3 shrink-0 opacity-30" />
      )}
    </button>
  );
}

const SCORE_COLUMNS: { label: string; key: SortKey; field: keyof ReviewerRanking }[] = [
  { label: 'Aggregate', key: 'aggregateScore', field: 'aggregateScore' },
  { label: 'Quality',   key: 'avgQualityScore', field: 'avgQualityScore' },
  { label: 'Quantity',  key: 'avgQuantityScore', field: 'avgQuantityScore' },
  { label: 'Timeliness', key: 'avgTimeScore',   field: 'avgTimeScore' },
];

const COUNT_COLUMNS: { label: string; key: SortKey; field: keyof ReviewerRanking; color: string }[] = [
  { label: 'Completed', key: 'totalCompleted',  field: 'totalCompleted',  color: 'text-emerald-400' },
  { label: 'Incomplete', key: 'totalIncomplete', field: 'totalIncomplete', color: 'text-amber-400' },
  { label: 'Declined',  key: 'totalDeclined',   field: 'totalDeclined',   color: 'text-red-400' },
];

const ACTIVE_REVIEW_STATUSES = ['Invited', 'Accepted', 'PendingDecline', 'PendingExtension', 'Overdue'];

function assignmentStatusLabel(status: string) {
  switch (status) {
    case 'PendingDecline': return 'Decline requested';
    case 'PendingExtension': return 'Extension requested';
    default: return status;
  }
}

function assignmentStatusClass(status: string) {
  switch (status) {
    case 'Accepted': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'Overdue': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'PendingDecline': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'PendingExtension': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  }
}

// --- Main Component ---

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();

  // Admins don't use this page — redirect them to the admin dashboard
  React.useEffect(() => {
    if (user.isAdmin) {
      router.replace('/admin');
    }
  }, [user.isAdmin, router]);

  if (user.isAdmin) {
    return null;
  }

  // Common State
  const [pendingCount, setPendingCount] = React.useState(0);
  const [isLoadingPending, setIsLoadingPending] = React.useState(false);
  const [pendingError, setPendingError] = React.useState('');

  // Coordinator State (Reviewer Requests)
  const [reviewerRequests, setReviewerRequests] = React.useState<PendingReviewerRequest[]>([]);
  const [roundStartRequests, setRoundStartRequests] = React.useState<PendingRoundStartRequest[]>([]);
  const [reviewerRequestsError, setReviewerRequestsError] = React.useState('');

  // Coordinator State (Analytics/Leaderboard)
  const [analytics, setAnalytics] = React.useState<OverallAnalyticsResponse | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = React.useState(false);
  const [analyticsError, setAnalyticsError] = React.useState('');
  const [sortKey, setSortKey] = React.useState<SortKey>('aggregateScore');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [leaderboardSearch, setLeaderboardSearch] = React.useState('');

  // Coordinator State (Collaboration Invitations)
  const [collabInvitationCount, setCollabInvitationCount] = React.useState(0);

  // Reviewer State (Request Decisions/Notifications)
  const [myReviewAssignments, setMyReviewAssignments] = React.useState<MyAssignment[]>([]);
  const [isLoadingMyReviews, setIsLoadingMyReviews] = React.useState(false);
  const [requestDecisions, setRequestDecisions] = React.useState<ReviewerRequestDecision[]>([]);
  const [requestDecisionsError, setRequestDecisionsError] = React.useState('');
  const [selectedDecisionIds, setSelectedDecisionIds] = React.useState<Set<string>>(new Set());
  const [isDeletingDecisions, setIsDeletingDecisions] = React.useState(false);

  // --- Load Logic ---

  const loadPendingSignups = React.useCallback(async () => {
    if (!user.isCoordinator) return;
    setIsLoadingPending(true);
    setPendingError('');
    try {
      const response = await getPendingSignupsRequest();
      setPendingCount(response.users.length);
    } catch (caughtError) {
      setPendingError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load pending approvals.');
    } finally {
      setIsLoadingPending(false);
    }
  }, [user.isCoordinator]);

  const loadCollabInvitationCount = React.useCallback(async () => {
    if (!user.isCoordinator) return;
    try {
      const data = await getPendingCollaborationInvitationsRequest();
      setCollabInvitationCount(data.length);
    } catch {
      // silently ignore
    }
  }, [user.isCoordinator]);

  const loadReviewerRequests = React.useCallback(async () => {
    if (!user.isCoordinator) return;
    setReviewerRequestsError('');
    try {
      const papers = await getMyCoordinatedPapersRequest();
      const roundsByPaper = await Promise.all(
        papers.map(async paper => ({
          paper,
          rounds: await getPaperRoundsRequest(paper.id),
        })),
      );

      const roundRequests = roundsByPaper.flatMap(({ paper, rounds }) =>
        rounds
          .filter(round => round.status === 'Draft')
          .map(round => ({
            id: round.id,
            paperId: paper.id,
            paperTitle: paper.title,
            roundNumber: round.roundNumber,
            targetVenue: round.targetVenue,
            venueCategory: round.venueCategory,
            deadline: round.deadline,
          })),
      );

      const requests = roundsByPaper.flatMap(({ paper, rounds }) =>
        rounds.flatMap(round =>
          round.assignments.flatMap(assignment => {
            const items: PendingReviewerRequest[] = [];
            if (assignment.pendingDeclineRequest) {
              items.push({
                id: assignment.pendingDeclineRequest.id,
                type: 'Decline',
                paperId: paper.id,
                paperTitle: paper.title,
                roundNumber: round.roundNumber,
                reviewerName: assignment.reviewer.name,
                reason: assignment.pendingDeclineRequest.reason,
              });
            }
            if (assignment.pendingExtensionRequest) {
              items.push({
                id: assignment.pendingExtensionRequest.id,
                type: 'Extension',
                paperId: paper.id,
                paperTitle: paper.title,
                roundNumber: round.roundNumber,
                reviewerName: assignment.reviewer.name,
                reason: assignment.pendingExtensionRequest.reason,
              });
            }
            return items;
          }),
        ),
      );
      setRoundStartRequests(roundRequests);
      setReviewerRequests(requests);
    } catch (caughtError) {
      setReviewerRequestsError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load reviewer requests.');
    }
  }, [user.isCoordinator]);

  const loadAnalytics = React.useCallback(async () => {
    if (!user.isCoordinator) return;
    setIsLoadingAnalytics(true);
    setAnalyticsError('');
    try {
      const data = await getOverallAnalyticsRequest();
      setAnalytics(data);
    } catch (caughtError) {
      setAnalyticsError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load leaderboard.');
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [user.isCoordinator]);

  const loadRequestDecisions = React.useCallback(async () => {
    if (user.isCoordinator || user.isAdmin || user.isFrozen) return;
    setIsLoadingMyReviews(true);
    setRequestDecisionsError('');
    try {
      const assignments = await getMyAssignmentsRequest();
      const activeAssignments = assignments
        .filter(assignment => ACTIVE_REVIEW_STATUSES.includes(assignment.status))
        .sort((a, b) => {
          const left = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
          const right = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
          return left - right;
        });
      setMyReviewAssignments(activeAssignments);

      const decisions = assignments.flatMap(assignment => {
        const declineDecisions = assignment.resolvedDeclineRequests.map(request => ({
          id: request.id,
          type: 'Decline' as const,
          status: request.status,
          paperTitle: assignment.paper.title,
          roundNumber: assignment.round.roundNumber,
          reason: request.reason,
          requestedAt: request.requestedAt,
        }));

        const extensionDecisions = assignment.resolvedExtensionRequests.map(request => ({
          id: request.id,
          type: 'Extension' as const,
          status: request.status,
          paperTitle: assignment.paper.title,
          roundNumber: assignment.round.roundNumber,
          reason: request.reason,
          requestedDeadline: request.requestedDeadline,
          approvedDeadline: request.approvedDeadline,
          requestedAt: request.requestedAt,
        }));

        return [...declineDecisions, ...extensionDecisions];
      });

      decisions.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      setRequestDecisions(decisions);
    } catch (caughtError) {
      setRequestDecisionsError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load request decisions.');
    } finally {
      setIsLoadingMyReviews(false);
    }
  }, [user.isCoordinator, user.isAdmin]);

  // --- Effects ---

  React.useEffect(() => {
    loadPendingSignups();
    if (user.isCoordinator) {
      loadReviewerRequests();
      loadAnalytics();
      loadCollabInvitationCount();
    } else if (!user.isAdmin && !user.isFrozen) {
      loadRequestDecisions();
    }
  }, [user.isCoordinator, user.isAdmin, loadPendingSignups, loadReviewerRequests, loadAnalytics, loadRequestDecisions, loadCollabInvitationCount]);

  // --- Actions ---

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedRankings = React.useMemo<ReviewerRanking[]>(() => {
    if (!analytics) return [];
    const sorted = [...analytics.rankings].sort((a, b) => {
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    const query = leaderboardSearch.trim().toLocaleLowerCase();
    if (!query) return sorted;

    return [
      ...sorted.filter(reviewer => reviewer.name.toLocaleLowerCase().includes(query)),
      ...sorted.filter(reviewer => !reviewer.name.toLocaleLowerCase().includes(query)),
    ];
  }, [analytics, sortKey, sortDir, leaderboardSearch]);

  const toggleDecisionSelection = (id: string) => {
    setSelectedDecisionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllDecisions = () => {
    const visibleDecisionIds = requestDecisions.slice(0, 5).map(decision => decision.id);
    setSelectedDecisionIds(prev => {
      if (visibleDecisionIds.every(id => prev.has(id))) return new Set();
      return new Set(visibleDecisionIds);
    });
  };

  const handleDismissSelectedDecisions = async () => {
    if (selectedDecisionIds.size === 0) return;
    setIsDeletingDecisions(true);
    setRequestDecisionsError('');
    try {
      const selectedDecisions = requestDecisions.filter(decision => selectedDecisionIds.has(decision.id));
      const declineIds = selectedDecisions.filter(decision => decision.type === 'Decline').map(decision => decision.id);
      const extensionIds = selectedDecisions.filter(decision => decision.type === 'Extension').map(decision => decision.id);

      await dismissRequestDecisionsRequest(declineIds, extensionIds);
      setSelectedDecisionIds(new Set());
      await loadRequestDecisions();
    } catch (caughtError) {
      setRequestDecisionsError(caughtError instanceof ApiError ? caughtError.message : 'Failed to remove selected request decisions.');
    } finally {
      setIsDeletingDecisions(false);
    }
  };

  // --- UI Configuration ---

  const stats: DashboardStat[] = user.isCoordinator
    ? [
        { label: 'Pending Approvals', value: isLoadingPending ? '...' : pendingCount, icon: UserCheck, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/pending-approvals' },
        { label: 'Round Requests', value: roundStartRequests.length, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/rounds' },
        { label: 'Collaboration Invitations', value: collabInvitationCount, icon: FileText, color: 'text-indigo-400', bg: 'bg-indigo-500/10', href: '/pending-approvals' },
      ]
    : user.isFrozen
    ? [
        { label: 'Account Status', value: 'Alumni', icon: Snowflake, color: 'text-sky-400', bg: 'bg-sky-500/10' },
        { label: 'Profile Access', value: 'Active', icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
      ]
    : [
        { label: 'Account Status', value: 'Active', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { label: 'Profile Access', value: 'Ready', icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Assigned Reviews', value: isLoadingMyReviews ? '...' : myReviewAssignments.length, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/my-reviews' },
      ];

  const visibleRequestDecisions = requestDecisions.slice(0, 5);
  const allVisibleDecisionsSelected = visibleRequestDecisions.length > 0
    && visibleRequestDecisions.every(decision => selectedDecisionIds.has(decision.id));

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Welcome, {user.name}</h1>
        {user.isCoordinator && (
          <p className="text-slate-400 mt-2">Review pending account requests and keep the system moving.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map(stat => {
          const Icon = stat.icon;
          const content = (
            <>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${stat.bg}`}>
                <Icon className={`w-7 h-7 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-400">{stat.label}</p>
                <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
              </div>
            </>
          );

          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="glass p-6 rounded-2xl border border-white/5 flex items-center gap-5 hover:bg-white/5 transition-colors">
              {content}
            </Link>
          ) : (
            <div key={stat.label} className="glass p-6 rounded-2xl border border-white/5 flex items-center gap-5 hover:bg-white/5 transition-colors">
              {content}
            </div>
          );
        })}
      </div>

      {user.isCoordinator && pendingError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pendingError}
        </div>
      )}

      {/* --- Coordinator Section: Leaderboard & Requests --- */}
      {user.isCoordinator && (
        <div className="space-y-8">
          
          {/* Leaderboard */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-blue-400" />
              Reviewer Leaderboard
            </h2>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={leaderboardSearch}
                onChange={event => setLeaderboardSearch(event.target.value)}
                placeholder="Search reviewer by name..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>

            {analyticsError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {analyticsError}
              </div>
            )}

            {isLoadingAnalytics ? (
              <div className="glass rounded-2xl border border-white/5 p-8 text-center text-slate-400 text-sm">
                Loading leaderboard…
              </div>
            ) : analytics && (
              <>
                {sortedRankings.length === 0 ? (
                  <div className="glass rounded-2xl border border-white/5 p-8 text-center text-slate-400 text-sm">
                    No reviewers in your lab yet.
                  </div>
                ) : (
                  <div className="glass rounded-2xl border border-white/5 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-10">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Reviewer</th>
                          {SCORE_COLUMNS.map(col => (
                            <th key={col.key} className={`px-4 py-3 transition-colors ${sortKey === col.key ? 'bg-blue-500/8' : ''}`}>
                              <SortButton label={col.label} sortKey={col.key} currentKey={sortKey} direction={sortDir} onSort={handleSort} />
                            </th>
                          ))}
                          {COUNT_COLUMNS.map(col => (
                            <th key={col.key} className={`px-4 py-3 transition-colors ${sortKey === col.key ? 'bg-blue-500/8' : ''}`}>
                              <SortButton label={col.label} sortKey={col.key} currentKey={sortKey} direction={sortDir} onSort={handleSort} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRankings.map((reviewer, idx) => {
                          const isFirst = idx === 0;
                          return (
                            <tr key={reviewer.userId} className={`border-b border-white/5 last:border-0 transition-colors hover:bg-white/5 ${isFirst ? 'bg-amber-500/5' : ''}`}>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-bold tabular-nums ${isFirst ? 'text-amber-400' : 'text-slate-400'}`}>{idx + 1}</span>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-white">{reviewer.name}</p>
                                <p className="text-xs text-slate-500">{reviewer.email}</p>
                              </td>
                              {SCORE_COLUMNS.map(col => (
                                <td key={col.key} className={`px-4 py-3 text-right tabular-nums transition-colors ${sortKey === col.key ? 'bg-blue-500/8' : ''} ${col.key === 'aggregateScore' ? 'font-semibold text-white' : 'text-slate-300'}`}>
                                  {formatScore(reviewer[col.field] as number | null)}
                                </td>
                              ))}
                              {COUNT_COLUMNS.map(col => (
                                <td key={col.key} className={`px-4 py-3 text-right tabular-nums font-medium transition-colors ${sortKey === col.key ? 'bg-blue-500/8' : ''} ${col.color}`}>
                                  {reviewer[col.field] as number}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Requests */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              Pending Requests
            </h2>

            <section className="glass rounded-2xl border border-white/5 p-6">
              {reviewerRequestsError ? (
                <p className="text-sm text-red-400">{reviewerRequestsError}</p>
              ) : roundStartRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No pending round start requests.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {roundStartRequests.slice(0, 5).map(request => (
                    <div key={request.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            Round start
                          </span>
                          <span className="text-xs text-slate-500">Round {request.roundNumber}</span>
                        </div>
                        <Link href={`/rounds?paper=${request.paperId}`} className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">
                          Open
                        </Link>
                      </div>
                      <p className="text-sm font-semibold text-white truncate">{request.paperTitle}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {request.targetVenue} · {request.venueCategory} · due {formatDate(request.deadline)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="glass rounded-2xl border border-white/5 p-6">
              <h3 className="text-sm font-semibold text-white mb-4">Reviewer Requests</h3>
              {reviewerRequestsError ? (
                <p className="text-sm text-red-400">{reviewerRequestsError}</p>
              ) : reviewerRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No pending reviewer requests.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {reviewerRequests.slice(0, 5).map(request => (
                    <div key={request.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20">
                            {request.type} request
                          </span>
                          <span className="text-xs text-slate-500">Round {request.roundNumber}</span>
                        </div>
                        <Link href={`/rounds?paper=${request.paperId}`} className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">
                          Open
                        </Link>
                      </div>
                      <p className="text-sm font-semibold text-white truncate">{request.paperTitle}</p>
                      <p className="text-xs text-slate-400 mt-1">{request.reviewerName}: {request.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>

        {collabInvitationCount > 0 && (
          <section className="glass rounded-2xl border border-indigo-500/20 p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                {collabInvitationCount} pending collaboration invitation{collabInvitationCount !== 1 ? 's' : ''}
              </h3>
              <Link href="/pending-approvals" className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                Review invitations
              </Link>
            </div>
            <p className="text-sm text-slate-400">Other labs have invited your lab to collaborate on papers. Visit Pending Approvals to accept or decline.</p>
          </section>
        )}
        </div>
      )}

      {/* --- Frozen alumni info section --- */}
      {!user.isCoordinator && !user.isAdmin && user.isFrozen && (
        <section className="glass rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-6">
          <div className="flex items-center gap-3 mb-2">
            <Snowflake className="w-5 h-5 text-sky-400 shrink-0" />
            <h2 className="text-lg font-semibold text-sky-200">Alumni Account</h2>
          </div>
          <p className="text-sm text-sky-300/80">
            Your account is currently frozen. You can still view lab members and update your profile, but research activities are not available.
          </p>
        </section>
      )}

      {/* --- Lab Member Section: Notifications --- */}
      {!user.isCoordinator && !user.isAdmin && !user.isFrozen && (
        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Assigned Reviews
            </h2>
            <Link href="/my-reviews" className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">
              Open my reviews
            </Link>
          </div>

          {requestDecisionsError ? (
            <p className="text-sm text-red-400">{requestDecisionsError}</p>
          ) : isLoadingMyReviews ? (
            <p className="text-sm text-slate-500">Loading review assignments...</p>
          ) : myReviewAssignments.length === 0 ? (
            <p className="text-sm text-slate-500">No active review assignments yet.</p>
          ) : (
            <div className="space-y-3">
              {myReviewAssignments.slice(0, 5).map(assignment => (
                <div key={assignment.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${assignmentStatusClass(assignment.status)}`}>
                        {assignmentStatusLabel(assignment.status)}
                      </span>
                      <span className="text-xs text-slate-500">Round {assignment.round.roundNumber}</span>
                    </div>
                    <span className="text-xs text-slate-500">Due {formatDate(assignment.deadline)}</span>
                  </div>
                  <p className="text-sm font-semibold text-white truncate">{assignment.paper.title}</p>
                  <p className="text-xs text-slate-400 mt-1">{assignment.round.targetVenue}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!user.isCoordinator && !user.isAdmin && !user.isFrozen && (
        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              Responses to Requests
            </h2>
            <div className="flex items-center gap-3">
              {requestDecisions.length > 0 && (
                <>
                  <button onClick={toggleAllDecisions} className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">
                    {allVisibleDecisionsSelected ? 'Clear selection' : 'Select all'}
                  </button>
                  <button
                    onClick={handleDismissSelectedDecisions}
                    disabled={selectedDecisionIds.size === 0 || isDeletingDecisions}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isDeletingDecisions ? 'Removing...' : `Remove selected${selectedDecisionIds.size > 0 ? ` (${selectedDecisionIds.size})` : ''}`}
                  </button>
                </>
              )}
              <Link href="/my-reviews" className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">
                Open my reviews
              </Link>
            </div>
          </div>

          {requestDecisionsError ? (
            <p className="text-sm text-red-400">{requestDecisionsError}</p>
          ) : requestDecisions.length === 0 ? (
            <p className="text-sm text-slate-500">No responses to extension or decline requests yet.</p>
          ) : (
            <div className="space-y-3">
              {visibleRequestDecisions.map(decision => {
                const isApproved = decision.status === 'Approved';
                return (
                  <div key={decision.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedDecisionIds.has(decision.id)}
                          onChange={() => toggleDecisionSelection(decision.id)}
                          aria-label={`Select ${decision.type} request decision for ${decision.paperTitle}`}
                          className="h-4 w-4 rounded border-white/20 bg-background accent-blue-500"
                        />
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${isApproved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {decision.type} request {isApproved ? 'accepted' : 'declined'}
                        </span>
                        <span className="text-xs text-slate-500">Round {decision.roundNumber}</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-white">{decision.paperTitle}</p>
                    <p className="text-xs text-slate-400 mt-1">{decision.reason}</p>
                    {decision.type === 'Extension' && (
                      <p className="text-xs text-slate-500 mt-1">
                        Requested: {formatDate(decision.requestedDeadline ?? null)}
                        {decision.approvedDeadline ? ` · Approved: ${formatDate(decision.approvedDeadline)}` : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

    </div>
  );
}
