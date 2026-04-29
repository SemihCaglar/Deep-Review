'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MyAssignment,
  ApiError,
  getMyAssignmentsRequest,
  respondToInvitationRequest,
  requestExtensionRequest,
  completeReviewRequest,
} from '@/lib/api';
import { CheckCircle, XCircle, Clock, FileText, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const ACTIVE_ASSIGNMENT_STATUSES = ['Invited', 'Accepted', 'PendingDecline', 'PendingExtension', 'Overdue'];

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dueLabel(deadline: string | null) {
  if (!deadline) return 'No reviewer deadline set';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(deadline);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} overdue`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  return `${diffDays} days left`;
}

function statusColor(status: string) {
  switch (status) {
    case 'Invited':    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'Accepted':   return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'PendingDecline': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'PendingExtension': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'Declined':   return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'Completed':  return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'Cancelled':  return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    case 'Overdue':    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default:           return 'bg-white/10 text-slate-300 border-white/10';
  }
}

function AssignmentCard({ assignment, onRefresh }: { assignment: MyAssignment; onRefresh: () => void }) {
  const [showAbstract, setShowAbstract] = useState(false);

  // Decline flow
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Extension flow
  const [showExtForm, setShowExtForm] = useState(false);
  const [extReason, setExtReason] = useState('');
  const [extDate, setExtDate] = useState('');

  // Complete flow
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [reviewSummary, setReviewSummary] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const act = async (fn: () => Promise<{ message: string }>) => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fn();
      setSuccessMsg(res.message);
      onRefresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = () =>
    act(() => respondToInvitationRequest(assignment.id, 'accept'));

  const handleDecline = () => {
    if (!declineReason.trim()) { setError('Please provide a reason for declining.'); return; }
    act(async () => {
      const res = await respondToInvitationRequest(assignment.id, 'decline', declineReason.trim());
      setShowDeclineForm(false);
      setDeclineReason('');
      return res;
    });
  };

  const handleExtension = () => {
    if (!extReason.trim() || !extDate) { setError('Please fill in both the reason and the requested date.'); return; }
    act(async () => {
      const res = await requestExtensionRequest(assignment.id, extReason.trim(), new Date(extDate).toISOString());
      setShowExtForm(false);
      setExtReason('');
      setExtDate('');
      return res;
    });
  };

  const handleComplete = () =>
    act(async () => {
      const res = await completeReviewRequest(assignment.id, reviewSummary.trim() || undefined);
      setShowCompleteForm(false);
      setReviewSummary('');
      return res;
    });

  const assignDeadlineDate = assignment.deadline
    ? new Date(assignment.deadline).toISOString().split('T')[0]
    : new Date(assignment.round.deadline).toISOString().split('T')[0];

  return (
    <div className="glass rounded-2xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor(assignment.status)}`}>
                {assignment.status === 'PendingDecline'
                  ? 'Decline Requested'
                  : assignment.status === 'PendingExtension'
                    ? 'Extension Requested'
                    : assignment.status}
              </span>
              <span className="text-xs text-slate-500">Round {assignment.round.roundNumber}</span>
              {assignment.pendingDeclineRequest && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20">
                  Decline Pending Approval
                </span>
              )}
              {assignment.pendingExtensionRequest && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-blue-500/10 text-blue-400 border-blue-500/20">
                  Extension Pending Approval
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-white leading-snug">{assignment.paper.title}</h3>
            <p className="text-xs text-slate-500 mt-1">{assignment.paper.targetVenue}</p>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0 text-right">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Your deadline: <span className="text-white">{formatDate(assignment.deadline)}</span></span>
            </div>
            <div className="text-xs text-slate-500">
              {dueLabel(assignment.deadline)}
            </div>
            <div className="text-xs text-slate-600">
              Round deadline: {formatDate(assignment.round.deadline)}
            </div>
          </div>
        </div>

        {/* Abstract toggle */}
        <button
          onClick={() => setShowAbstract(v => !v)}
          className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          {showAbstract ? 'Hide' : 'Show'} abstract
          {showAbstract ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showAbstract && (
          <p className="mt-2 text-xs text-slate-400 leading-relaxed border-l-2 border-white/10 pl-3">
            {assignment.paper.abstractText}
          </p>
        )}
      </div>

      {/* Actions */}
      {ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status) && (
        <div className="border-t border-white/5 px-6 py-4 space-y-4">

          {/* ── Invited actions ── */}
          {assignment.status === 'Invited' && !assignment.pendingDeclineRequest && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAccept}
                  disabled={busy}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> Accept
                </button>
                <button
                  onClick={() => { setShowDeclineForm(v => !v); setError(''); }}
                  disabled={busy}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Request Decline
                </button>
              </div>

              {showDeclineForm && (
                <div className="space-y-2 p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                  <p className="text-xs font-semibold text-slate-400">Reason for requesting to decline (required)</p>
                  <textarea
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    rows={3}
                    placeholder="Explain why you cannot review this paper. The coordinator will review your request."
                    className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500/50 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDecline}
                      disabled={busy || !declineReason.trim()}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors"
                    >
                      Send Request to Coordinator
                    </button>
                    <button onClick={() => setShowDeclineForm(false)} className="text-xs text-slate-500 hover:text-slate-300">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending decline — waiting for coordinator */}
          {(assignment.status === 'Invited' || assignment.status === 'PendingDecline') && assignment.pendingDeclineRequest && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-400">Decline request sent to coordinator</p>
                <p className="text-xs text-slate-400 mt-0.5">Waiting for coordinator to approve or reject your request to decline.</p>
                <p className="text-xs text-slate-500 mt-1">Your reason: {assignment.pendingDeclineRequest.reason}</p>
              </div>
            </div>
          )}

          {/* ── Accepted actions ── */}
          {(assignment.status === 'Accepted' || assignment.status === 'PendingExtension' || assignment.status === 'Overdue') && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setShowCompleteForm(v => !v); setError(''); }}
                  disabled={busy || assignment.status === 'PendingExtension'}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> Submit Review
                </button>
                <button
                  onClick={() => { setShowExtForm(v => !v); setError(''); }}
                  disabled={busy || !!assignment.pendingExtensionRequest}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
                >
                  <Clock className="w-4 h-4" /> Request Deadline
                </button>
              </div>

              {/* Extension pending info */}
              {assignment.pendingExtensionRequest && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
                  <Clock className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-blue-400">Deadline request sent to coordinator</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Requested: {formatDate(assignment.pendingExtensionRequest.requestedDeadline)} — waiting for coordinator approval.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Your reason: {assignment.pendingExtensionRequest.reason}</p>
                  </div>
                </div>
              )}

              {showCompleteForm && (
                <div className="space-y-2 p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                  <p className="text-xs font-semibold text-slate-400">Review summary (optional)</p>
                  <textarea
                    value={reviewSummary}
                    onChange={e => setReviewSummary(e.target.value)}
                    rows={4}
                    placeholder="Write your review summary here..."
                    className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleComplete}
                      disabled={busy}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-colors"
                    >
                      Submit Review
                    </button>
                    <button onClick={() => setShowCompleteForm(false)} className="text-xs text-slate-500 hover:text-slate-300">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {showExtForm && (
                <div className="space-y-2 p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                  <p className="text-xs font-semibold text-slate-400">Request a new deadline</p>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-500 shrink-0">New date:</label>
                    <input
                      type="date"
                      value={extDate}
                      onChange={e => setExtDate(e.target.value)}
                      min={assignDeadlineDate}
                      className="bg-background border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>
                  <textarea
                    value={extReason}
                    onChange={e => setExtReason(e.target.value)}
                    rows={2}
                    placeholder="Reason for extension request..."
                    className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleExtension}
                      disabled={busy || !extReason.trim() || !extDate}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
                    >
                      Send Request to Coordinator
                    </button>
                    <button onClick={() => setShowExtForm(false)} className="text-xs text-slate-500 hover:text-slate-300">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
          {successMsg && <p className="text-xs text-emerald-400">{successMsg}</p>}
        </div>
      )}
    </div>
  );
}

export default function MyReviewsPage() {
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getMyAssignmentsRequest()
      .then(setAssignments)
      .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load assignments'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = assignments.filter(a => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status));
  const past = assignments.filter(a => !ACTIVE_ASSIGNMENT_STATUSES.includes(a.status));

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8 animate-in fade-in duration-500 mb-20">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
          My Assigned Reviews
        </h1>
        <p className="text-slate-400 mt-2">Respond to invitations, submit reviews, and manage deadlines.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
          Loading assignments...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : assignments.length === 0 ? (
        <div className="glass rounded-2xl border border-white/5 p-12 text-center">
          <CheckCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No review assignments yet.</p>
          <p className="text-slate-500 text-xs mt-2">
            Invited papers will appear here after a coordinator assigns you to a review round.
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Active</h2>
              {active.map(a => <AssignmentCard key={a.id} assignment={a} onRefresh={load} />)}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Past</h2>
              {past.map(a => <AssignmentCard key={a.id} assignment={a} onRefresh={load} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
