'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, UserCheck, UserX } from 'lucide-react';
import {
  ApiError,
  approveSignupRequest,
  getPendingSignupsRequest,
  getReviewedSignupsRequest,
  rejectSignupRequest,
  type PendingSignup,
} from '@/lib/api';
import { useUser } from '@/components/context/UserContext';

type PendingConfirmation = {
  action: 'approve' | 'reject';
  signup: PendingSignup;
};

export default function PendingApprovalsPage() {
  const router = useRouter();
  const { user } = useUser();
  const [pendingSignups, setPendingSignups] = React.useState<PendingSignup[]>([]);
  const [reviewedSignups, setReviewedSignups] = React.useState<PendingSignup[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);
  const [error, setError] = React.useState('');
  const [historyError, setHistoryError] = React.useState('');
  const [actionMessage, setActionMessage] = React.useState('');
  const [activeSignupId, setActiveSignupId] = React.useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = React.useState<PendingConfirmation | null>(null);

  const loadPendingSignups = React.useCallback(async () => {
    if (!user.isCoordinator) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await getPendingSignupsRequest();
      setPendingSignups(response.users);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load pending approvals.');
    } finally {
      setIsLoading(false);
    }
  }, [user.isCoordinator]);

  const loadReviewedSignups = React.useCallback(async () => {
    if (!user.isCoordinator) {
      return;
    }

    setIsLoadingHistory(true);
    setHistoryError('');

    try {
      const response = await getReviewedSignupsRequest();
      setReviewedSignups(response.users);
    } catch (caughtError) {
      setHistoryError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load approval history.');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user.isCoordinator]);

  React.useEffect(() => {
    if (!user.id) {
      return;
    }

    if (!user.isCoordinator) {
      router.replace('/dashboard');
      return;
    }

    loadPendingSignups();
    loadReviewedSignups();
  }, [loadPendingSignups, loadReviewedSignups, router, user.id, user.isCoordinator]);

  const handlePendingAction = async (signupId: string, action: 'approve' | 'reject') => {
    setActiveSignupId(signupId);
    setError('');
    setActionMessage('');

    try {
      if (action === 'approve') {
        await approveSignupRequest(signupId);
        setActionMessage('Signup approved successfully.');
      } else {
        await rejectSignupRequest(signupId);
        setActionMessage('Signup rejected successfully.');
      }

      setPendingSignups(current => current.filter(signup => signup.id !== signupId));
      await loadReviewedSignups();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to update signup approval.');
    } finally {
      setActiveSignupId(null);
    }
  };

  const openConfirmation = (signup: PendingSignup, action: 'approve' | 'reject') => {
    setActionMessage('');
    setError('');
    setPendingConfirmation({ signup, action });
  };

  const closeConfirmation = () => {
    if (activeSignupId) {
      return;
    }

    setPendingConfirmation(null);
  };

  const confirmPendingAction = async () => {
    if (!pendingConfirmation) {
      return;
    }

    const { action, signup } = pendingConfirmation;
    await handlePendingAction(signup.id, action);
    setPendingConfirmation(null);
  };

  if (!user.isCoordinator) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Pending Approvals</h1>
          <p className="text-slate-400 mt-2">Review pending signup requests from lab members waiting for access.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            loadPendingSignups();
            loadReviewedSignups();
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors"
          disabled={isLoading}
        >
          <RefreshCcw className="w-4 h-4" />
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {actionMessage ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {actionMessage}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <section className="glass rounded-2xl border border-white/5 p-8">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading pending approvals...</p>
        ) : pendingSignups.length ? (
          <div className="space-y-4">
            {pendingSignups.map(signup => (
              <div key={signup.id} className="rounded-2xl border border-white/10 bg-background/60 p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-white">{signup.name}</p>
                  <p className="text-sm text-slate-300">{signup.email}</p>
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Submitted {new Date(signup.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openConfirmation(signup, 'approve')}
                    disabled={activeSignupId === signup.id}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => openConfirmation(signup, 'reject')}
                    disabled={activeSignupId === signup.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors"
                  >
                    <UserX className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">There are no pending signup requests right now.</p>
        )}
      </section>

      <section className="glass rounded-2xl border border-white/5 p-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white">Approval History</h2>
          <p className="text-sm text-slate-400 mt-1">Previously reviewed signup requests, newest first.</p>
        </div>

        {historyError ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-4">
            {historyError}
          </div>
        ) : null}

        {isLoadingHistory ? (
          <p className="text-sm text-slate-400">Loading approval history...</p>
        ) : reviewedSignups.length ? (
          <div className="space-y-4">
            {reviewedSignups.map(signup => (
              <div key={signup.id} className="rounded-2xl border border-white/10 bg-background/60 p-5 space-y-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-white">{signup.name}</p>
                    <p className="text-sm text-slate-300">{signup.email}</p>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Submitted {new Date(signup.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-left md:text-right space-y-1">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        signup.approvalStatus === 'Approved'
                          ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                          : 'border border-red-500/20 bg-red-500/10 text-red-300'
                      }`}
                    >
                      {signup.approvalStatus}
                    </span>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Reviewed {signup.approvalReviewedAt ? new Date(signup.approvalReviewedAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>

                {signup.approvalNote ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Approval Note</p>
                    <p className="text-sm text-slate-200">{signup.approvalNote}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No reviewed signup requests yet.</p>
        )}
      </section>

      {pendingConfirmation ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm"
          onClick={event => {
            if (event.target === event.currentTarget) {
              closeConfirmation();
            }
          }}
        >
          <div className="glass w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl">
            <div className="mb-5 space-y-2">
              <h2 className="text-xl font-semibold text-white">
                {pendingConfirmation.action === 'approve' ? 'Approve Account' : 'Reject Account'}
              </h2>
              <p className="text-sm text-slate-300">
                {pendingConfirmation.action === 'approve'
                  ? 'You are approving this account. Are you sure?'
                  : 'You are rejecting this account. Are you sure?'}
              </p>
              <p className="break-words text-sm text-slate-500">
                {pendingConfirmation.signup.name} · {pendingConfirmation.signup.email}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmation}
                disabled={activeSignupId === pendingConfirmation.signup.id}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPendingAction}
                disabled={activeSignupId === pendingConfirmation.signup.id}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  pendingConfirmation.action === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {activeSignupId === pendingConfirmation.signup.id
                  ? 'Working...'
                  : pendingConfirmation.action === 'approve'
                    ? 'Confirm Approve'
                    : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
