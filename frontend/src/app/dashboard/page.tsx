'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle, Clock, FileText, UserCheck, type LucideIcon } from 'lucide-react';
import {
  ApiError,
  getMyCoordinatedPapersRequest,
  getPaperRoundsRequest,
  getPendingSignupsRequest,
} from '@/lib/api';
import { useUser } from '@/components/context/UserContext';
import { LabTopicManager } from '@/components/LabTopicManager';

type PendingReviewerRequest = {
  id: string;
  type: 'Decline' | 'Extension';
  paperId: string;
  paperTitle: string;
  roundNumber: number;
  reviewerName: string;
  reason: string;
};

type DashboardStat = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  href?: string;
};

export default function DashboardPage() {
  const { user } = useUser();
  const [pendingCount, setPendingCount] = React.useState(0);
  const [isLoadingPending, setIsLoadingPending] = React.useState(false);
  const [pendingError, setPendingError] = React.useState('');
  const [reviewerRequests, setReviewerRequests] = React.useState<PendingReviewerRequest[]>([]);
  const [reviewerRequestsError, setReviewerRequestsError] = React.useState('');

  const loadPendingSignups = React.useCallback(async () => {
    if (!user.isCoordinator) {
      return;
    }

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

  const loadReviewerRequests = React.useCallback(async () => {
    if (!user.isCoordinator) {
      return;
    }

    setReviewerRequestsError('');

    try {
      const papers = await getMyCoordinatedPapersRequest();
      const roundsByPaper = await Promise.all(
        papers.map(async paper => ({
          paper,
          rounds: await getPaperRoundsRequest(paper.id),
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

      setReviewerRequests(requests);
    } catch (caughtError) {
      setReviewerRequestsError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load reviewer requests.');
    }
  }, [user.isCoordinator]);

  React.useEffect(() => {
    loadPendingSignups();
    loadReviewerRequests();
  }, [loadPendingSignups, loadReviewerRequests]);

  const stats: DashboardStat[] = user.isCoordinator
    ? [
        { label: 'Pending Approvals', value: isLoadingPending ? '...' : pendingCount, icon: UserCheck, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/pending-approvals' },
        { label: 'Coordinator Access', value: 1, icon: FileText, color: 'text-white', bg: 'bg-white/10' },
      ]
    : [
        { label: 'Account Status', value: 'Active', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { label: 'Profile Access', value: 'Ready', icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Review Access', value: 'Open', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
      ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Welcome, {user.name}</h1>
        <p className="text-slate-400 mt-2">
          {user.isCoordinator
            ? 'Review pending account requests and keep the system moving.'
            : 'Your account is ready to use once coordinator approval and assignments are available.'}
        </p>
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

      {user.isCoordinator && pendingError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pendingError}
        </div>
      ) : null}

      {user.isCoordinator && (
        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              Reviewer Requests
            </h2>
          </div>

          {reviewerRequestsError ? (
            <p className="text-sm text-red-400">{reviewerRequestsError}</p>
          ) : reviewerRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No pending reviewer requests.</p>
          ) : (
            <div className="space-y-3">
              {reviewerRequests.slice(0, 4).map(request => (
                <div key={request.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20">
                        {request.type} request
                      </span>
                      <span className="text-xs text-slate-500">Round {request.roundNumber}</span>
                    </div>
                    <Link
                      href={`/rounds?paper=${request.paperId}`}
                      className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Open this paper
                    </Link>
                  </div>
                  <p className="text-sm font-semibold text-white">{request.paperTitle}</p>
                  <p className="text-xs text-slate-400 mt-1">{request.reviewerName}: {request.reason}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Lab Management for Coordinators and Members */}
      {user.labs && user.labs.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-400" />
            Lab Management
          </h2>
          <div className="grid gap-6">
            {user.labs.map(lab => (
              <LabTopicManager key={lab.id} labId={lab.id} labName={lab.name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
