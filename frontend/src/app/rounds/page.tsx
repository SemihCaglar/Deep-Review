'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useUser } from '@/components/context/UserContext';
import {
  CoordinatedPaper,
  RoundWithAssignments,
  RoundAssignment,
  RoundStatusSummary,
  SuggestedReviewer,
  ProposedReviewer,
  ApiError,
  startAIReviewRequest,
  runComplianceCheckRequest,
  getMyCoordinatedPapersRequest,
  getPaperByIdRequest,
  getPaperRoundsRequest,
  getSuggestedReviewersRequest,
  assignReviewersRequest,
  sendInvitationsRequest,
  cancelAssignmentRequest,
  updateAssignmentDeadlineRequest,
  processDeclineRequestApi,
  processExtensionRequestApi,
  createRoundRequest,
  editRoundDeadlineRequest,
  editSubmissionDeadlineRequest,
  updateRoundDetailsRequest,
  reassignReviewerRequest,
  updateOverleafLinkRequest,
  sendRemindersRequest,
  getProposedReviewersRequest,
  addProposedReviewerRequest,
  removeProposedReviewerRequest,
  approveRoundRequest,
  getRoundStatusRequest,
  confirmChecklistSelectionRequest,
  runEmpiricalChecklistAnsweringRequest,
  getEmpiricalChecklistAnswersRequest,
} from '@/lib/api';
import { confirmCancel } from '@/lib/confirmAction';
import { ClipboardList, ChevronDown, ChevronUp, Mail, Ban, Calendar, CheckCircle, XCircle, AlertCircle, Clock, UserPlus, Loader2, Plus, ExternalLink, Edit2, Bell, Activity, ArrowLeft, Cpu, Download, Search } from 'lucide-react';

// ── Status badge ─────────────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case 'Draft':      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    case 'Open':       return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'Invited':    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'Accepted':   return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'PendingDecline': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'PendingExtension': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'Declined':   return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'Completed':  return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'Cancelled':  return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    case 'Overdue':    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'Reassigned': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    default:           return 'bg-white/10 text-slate-300 border-white/10';
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor(status)}`}>
      {status === 'PendingDecline'
        ? 'Decline Requested'
        : status === 'PendingExtension'
          ? 'Extension Requested'
          : status}
    </span>
  );
}

function PriorReviewIndicator() {
  return (
    <span
      title="This reviewer has previously completed a review for this paper."
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-300"
    >
      !
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toLocalDateInput(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayInputValue() {
  return toLocalDateInput(new Date());
}

function dateInputToUtcIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function maxDateInputValue(...values: Array<string | null | undefined>) {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted[sorted.length - 1];
}

// ── Assignment row ────────────────────────────────────────────────────────────

function AssignmentRow({
  assignment,
  roundDeadline,
  roundStatus,
  onRefresh,
  onReassign
}: {
  assignment: RoundAssignment;
  roundDeadline: string | null;
  roundStatus: RoundWithAssignments['status'];
  onRefresh: () => void;
  onReassign: (id: string) => void;
}) {
  const [showDeadlineInput, setShowDeadlineInput] = useState(false);
  const [newDeadline, setNewDeadline] = useState('');
  const [showExtApprove, setShowExtApprove] = useState(false);
  const [approvedDeadline, setApprovedDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reminderSent, setReminderSent] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onRefresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!(await confirmCancel())) return;
    act(() => cancelAssignmentRequest(assignment.id));
  };

  const handleUpdateDeadline = () =>
    act(async () => {
      await updateAssignmentDeadlineRequest(assignment.id, dateInputToUtcIso(newDeadline));
      setShowDeadlineInput(false);
    });

  const handleProcessDecline = (decision: 'approve' | 'reject') =>
    act(() => processDeclineRequestApi(assignment.pendingDeclineRequest!.id, decision));

  const handleProcessExtension = (decision: 'approve' | 'reject') =>
    act(async () => {
      await processExtensionRequestApi(
        assignment.pendingExtensionRequest!.id,
        decision,
        decision === 'approve' ? dateInputToUtcIso(approvedDeadline) : undefined,
      );
      setShowExtApprove(false);
    });

  const handleSendReminder = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await sendRemindersRequest([assignment.id]);
      if (result.sent > 0) {
        setReminderSent(true);
        setTimeout(() => setReminderSent(false), 3000);
      } else {
        setError('Reminder was not sent (assignment may not be in an active state).');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to send reminder');
    } finally {
      setBusy(false);
    }
  };

  const isCancelable = ['Invited', 'Accepted'].includes(assignment.status);
  const isRemindable = ['Accepted', 'PendingExtension', 'PendingDecline', 'Overdue'].includes(assignment.status);
  const showReassign = ['Declined', 'Cancelled'].includes(assignment.status);
  const isReassignable = roundStatus !== 'Completed' && assignment.status === 'Declined';
  const isCompleted = assignment.status === 'Completed';

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-5 rounded-xl bg-white/[0.02] border border-white/5">
        {/* Reviewer info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center font-semibold text-sm shrink-0">
            {assignment.reviewer.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-medium text-white truncate">{assignment.reviewer.name}</p>
              {assignment.hasPreviouslyCompletedReview && <PriorReviewIndicator />}
            </div>
            <p className="text-xs text-slate-500 truncate">{assignment.reviewer.email}</p>
          </div>
        </div>

        {/* Status + deadline */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <StatusBadge status={assignment.status} />
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            {formatDate(assignment.deadline)}
          </div>
          {assignment.invitationSent && (
            <div className="flex items-center gap-1 text-xs text-emerald-500">
              <Mail className="w-3.5 h-3.5" />
              Invitation sent
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isCancelable && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <Ban className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
          {showReassign && (
            <button
              onClick={() => onReassign(assignment.id)}
              disabled={busy || !isReassignable}
              title={!isReassignable ? 'Cancelled assignments cannot be reassigned' : undefined}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-orange-500/10"
            >
              <UserPlus className="w-3.5 h-3.5" /> Reassign
            </button>
          )}
          {assignment.status !== 'Reassigned' && assignment.status !== 'Cancelled' && (
            <button
              onClick={() => {
                if (!showDeadlineInput) {
                  setNewDeadline(assignment.deadline ? toLocalDateInput(assignment.deadline) : '');
                }
                setShowDeadlineInput(v => !v);
                setError('');
              }}
              disabled={busy || isCompleted}
              title={isCompleted ? 'Cannot change deadline for a completed assignment' : undefined}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Calendar className="w-3.5 h-3.5" /> Deadline
            </button>
          )}
          {isRemindable && (
            <button
              onClick={handleSendReminder}
              disabled={busy || reminderSent}
              title="Send manual reminder email to reviewer"
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                reminderSent
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              {reminderSent ? 'Sent!' : 'Remind'}
            </button>
          )}
        </div>
      </div>

      {/* Update deadline inline */}
      {showDeadlineInput && (
        <div className="mx-5 flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
          <span className="text-xs text-slate-400 shrink-0">New deadline:</span>
          <input
            type="date"
            value={newDeadline}
            onChange={e => setNewDeadline(e.target.value)}
            min={todayInputValue()}
            max={roundDeadline ? toLocalDateInput(roundDeadline) : undefined}
            className="bg-background border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <button
            onClick={handleUpdateDeadline}
            disabled={!newDeadline || busy}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            Save
          </button>
          <button onClick={async () => { if (await confirmCancel()) setShowDeadlineInput(false); }} className="text-xs text-slate-500 hover:text-slate-300">
            Cancel
          </button>
        </div>
      )}

      {/* Pending decline request */}
      {assignment.pendingDeclineRequest && (
        <div className="mx-5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-400 mb-0.5">Decline Request Pending</p>
                <p className="text-xs text-slate-400">&quot;{assignment.pendingDeclineRequest.reason}&quot;</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => handleProcessDecline('approve')}
                disabled={busy}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                onClick={() => handleProcessDecline('reject')}
                disabled={busy}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending extension request */}
      {assignment.pendingExtensionRequest && (
        <div className="mx-5 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-400 mb-0.5">Extension Request Pending</p>
                <p className="text-xs text-slate-400">
                  Requested: {formatDate(assignment.pendingExtensionRequest.requestedDeadline)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">&quot;{assignment.pendingExtensionRequest.reason}&quot;</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {!showExtApprove ? (
                <button
                  onClick={() => {
                    const requested = assignment.pendingExtensionRequest!.requestedDeadline;
                    setApprovedDeadline(requested ? toLocalDateInput(requested) : '');
                    setShowExtApprove(true);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={approvedDeadline}
                    onChange={e => setApprovedDeadline(e.target.value)}
                    min={todayInputValue()}
                    max={roundDeadline ? toLocalDateInput(roundDeadline) : undefined}
                    className="bg-background border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                  <button
                    onClick={() => handleProcessExtension('approve')}
                    disabled={!approvedDeadline || busy}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                  >
                    Confirm
                  </button>
                  <button onClick={() => setShowExtApprove(false)} className="text-xs text-slate-500 hover:text-slate-300">
                    Back
                  </button>
                </div>
              )}
              <button
                onClick={() => handleProcessExtension('reject')}
                disabled={busy}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review summary (completed assignments) */}
      {isCompleted && (
        <div className="mx-5 p-3 rounded-xl border border-purple-500/20 bg-purple-500/5">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-purple-400 mb-0.5">Review Submitted</p>
              {assignment.reviewSummary?.text ? (
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{assignment.reviewSummary.text}</p>
              ) : (
                <p className="text-xs text-slate-600 italic">No summary provided.</p>
              )}
              {assignment.reviewSummary?.submittedAt && (
                <p className="text-xs text-slate-600 mt-1">{formatDate(assignment.reviewSummary.submittedAt)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mx-5 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

// ── Round card ────────────────────────────────────────────────────────────────

function RoundCard({
  round,
  onRefresh,
  coordinatorId,
  paperHasOverleafLink,
}: {
  round: RoundWithAssignments;
  onRefresh: () => void;
  coordinatorId: string;
  paperHasOverleafLink: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  // Add Reviewer / Reassign panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [reassigningForId, setReassigningForId] = useState<string | null>(null);
  
  const [suggestions, setSuggestions] = useState<SuggestedReviewer[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState('');
  const [assignError, setAssignError] = useState('');
  const roundDeadlineHasNotPassed = round.deadline ? new Date(round.deadline).getTime() >= Date.now() : false;
  const canAddReviewer = round.status === 'Open' || (round.status === 'Completed' && roundDeadlineHasNotPassed);

  const openAddPanel = async (reassignId?: string) => {
    setShowAddPanel(true);
    setReassigningForId(reassignId || null);
    setSelectedIds(new Set());
    setAssignMsg('');
    setAssignError('');
    setLoadingSuggestions(true);
    setSuggestError('');
    try {
      const data = await getSuggestedReviewersRequest(round.id);
      setSuggestions(data);
    } catch (e) {
      setSuggestError(e instanceof ApiError ? e.message : 'Failed to load suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const toggleSelect = (id: string) => {
    if (reassigningForId) {
      setSelectedIds(new Set([id]));
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setAssigning(true);
    setAssignMsg('');
    setAssignError('');
    try {
      if (reassigningForId) {
        const newReviewerId = Array.from(selectedIds)[0];
        await reassignReviewerRequest(reassigningForId, newReviewerId);
        setAssignMsg(`Reviewer reassigned. Invitation sent automatically.`);
      } else {
        const result = await assignReviewersRequest(round.id, Array.from(selectedIds));
        await sendInvitationsRequest(round.id);
        setAssignMsg(`${result.length} reviewer(s) assigned and invited.`);
      }
      setSelectedIds(new Set());
      setShowAddPanel(false);
      onRefresh();
    } catch (e) {
      setAssignError(e instanceof ApiError ? e.message : 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  // Proposed reviewer management (Draft rounds)
  const [proposedReviewers, setProposedReviewers] = useState<ProposedReviewer[]>([]);
  const [loadingProposed, setLoadingProposed] = useState(false);
  const [showProposePanel, setShowProposePanel] = useState(false);
  const [proposeSuggestions, setProposeSuggestions] = useState<SuggestedReviewer[]>([]);
  const [loadingProposeSuggestions, setLoadingProposeSuggestions] = useState(false);
  const [proposeError, setProposeError] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveMsg, setApproveMsg] = useState('');
  const [approveError, setApproveError] = useState('');
  const [approvingProposedId, setApprovingProposedId] = useState<string | null>(null);

  const loadProposed = async () => {
    setLoadingProposed(true);
    try {
      const data = await getProposedReviewersRequest(round.id);
      setProposedReviewers(data);
    } catch { /* ignore */ } finally {
      setLoadingProposed(false);
    }
  };

  // Load proposed reviewers on mount for Draft rounds
  React.useEffect(() => {
    if (round.status === 'Draft') loadProposed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, round.status]);

  const openProposePanel = async () => {
    setShowProposePanel(true);
    setLoadingProposeSuggestions(true);
    setProposeError('');
    try {
      const data = await getSuggestedReviewersRequest(round.id);
      setProposeSuggestions(data.filter(s => !proposedReviewers.some(p => p.id === s.user.id)));
    } catch (e) {
      setProposeError(e instanceof ApiError ? e.message : 'Failed to load suggestions');
    } finally {
      setLoadingProposeSuggestions(false);
    }
  };

  const handleAddProposed = async (reviewerId: string) => {
    try {
      const updated = await addProposedReviewerRequest(round.id, reviewerId);
      setProposedReviewers(updated);
      setProposeSuggestions(prev => prev.filter(s => s.user.id !== reviewerId));
    } catch (e) {
      setProposeError(e instanceof ApiError ? e.message : 'Failed to add reviewer');
    }
  };

  const handleApproveProposed = async (reviewerId: string) => {
    setApprovingProposedId(reviewerId);
    setProposeError('');
    try {
      await assignReviewersRequest(round.id, [reviewerId]);
      const updated = await removeProposedReviewerRequest(round.id, reviewerId);
      setProposedReviewers(updated);
      onRefresh();
    } catch (e) {
      setProposeError(e instanceof ApiError ? e.message : 'Failed to assign proposed reviewer');
    } finally {
      setApprovingProposedId(null);
    }
  };

  const handleRemoveProposed = async (userId: string) => {
    try {
      const updated = await removeProposedReviewerRequest(round.id, userId);
      setProposedReviewers(updated);
    } catch (e) {
      setProposeError(e instanceof ApiError ? e.message : 'Failed to remove reviewer');
    }
  };

  const handleApproveRound = async () => {
    setApproving(true);
    setApproveMsg('');
    setApproveError('');
    try {
      const result = await approveRoundRequest(round.id);
      setApproveMsg(`Round started — ${result.assigned} reviewer(s) assigned.`);
      onRefresh();
    } catch (e) {
      setApproveError(e instanceof ApiError ? e.message : 'Failed to approve round');
    } finally {
      setApproving(false);
    }
  };

  const [editingDeadline, setEditingDeadline] = useState(false);
  const [draftDeadline, setDraftDeadline] = useState(round.deadline ? toLocalDateInput(round.deadline) : '');
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [deadlineError, setDeadlineError] = useState('');

  const [editingSubmissionDeadline, setEditingSubmissionDeadline] = useState(false);
  const [draftSubmissionDeadline, setDraftSubmissionDeadline] = useState(round.submissionDeadline ? toLocalDateInput(round.submissionDeadline) : '');
  const [savingSubmissionDeadline, setSavingSubmissionDeadline] = useState(false);
  const [submissionDeadlineError, setSubmissionDeadlineError] = useState('');

  const [editingDetails, setEditingDetails] = useState(false);
  const [draftVenueName, setDraftVenueName] = useState(round.targetVenue || '');
  const [draftVenueUrl, setDraftVenueUrl] = useState(round.targetVenueUrl || '');
  const [draftVenueCategory, setDraftVenueCategory] = useState<'Conference' | 'Journal'>(
    round.venueCategory === 'Journal' ? 'Journal' : 'Conference',
  );
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const handleSaveDetails = async () => {
    setDetailsError('');
    if (!draftVenueName.trim()) {
      setDetailsError('Venue name is required.');
      return;
    }
    if (!draftVenueUrl.trim()) {
      setDetailsError('Venue URL is required.');
      return;
    }
    if (!/^https?:\/\/.+/i.test(draftVenueUrl.trim())) {
      setDetailsError('Venue URL must start with http:// or https://.');
      return;
    }
    setSavingDetails(true);
    try {
      await updateRoundDetailsRequest(round.id, {
        targetVenue: draftVenueName.trim(),
        targetVenueUrl: draftVenueUrl.trim(),
        venueCategory: draftVenueCategory,
      });
      setEditingDetails(false);
      onRefresh();
    } catch (e) {
      setDetailsError(e instanceof Error ? e.message : 'Failed to update details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleEditDeadline = async () => {
    if (!draftDeadline) return;
    setSavingDeadline(true);
    setDeadlineError('');
    try {
      await editRoundDeadlineRequest(round.id, dateInputToUtcIso(draftDeadline));
      setEditingDeadline(false);
      onRefresh();
    } catch (e) {
      setDeadlineError(e instanceof ApiError ? e.message : 'Failed to update deadline');
    } finally {
      setSavingDeadline(false);
    }
  };

  const handleEditSubmissionDeadline = async () => {
    if (!draftSubmissionDeadline) return;
    setSavingSubmissionDeadline(true);
    setSubmissionDeadlineError('');
    try {
      await editSubmissionDeadlineRequest(round.id, dateInputToUtcIso(draftSubmissionDeadline));
      setEditingSubmissionDeadline(false);
      onRefresh();
    } catch (e) {
      setSubmissionDeadlineError(e instanceof ApiError ? e.message : 'Failed to update submission deadline');
    } finally {
      setSavingSubmissionDeadline(false);
    }
  };

  // Round status summary (Open rounds)
  const [statusSummary, setStatusSummary] = useState<RoundStatusSummary | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const loadStatus = React.useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await getRoundStatusRequest(round.id);
      setStatusSummary(data);
    } catch { /* non-fatal */ } finally {
      setLoadingStatus(false);
    }
  }, [round.id]);

  React.useEffect(() => {
    if (round.status === 'Open') loadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, round.status]);

  // AI Review
  const aiFileRef = useRef<HTMLInputElement>(null);
  const [runningAI, setRunningAI] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [localAiResult, setLocalAiResult] = useState<any>(null);
  const complianceFileRef = useRef<HTMLInputElement>(null);
  const [runningCompliance, setRunningCompliance] = useState(false);
  const [complianceError, setComplianceError] = useState('');
  const [localComplianceResult, setLocalComplianceResult] = useState<any>(null);
  const [complianceExpanded, setComplianceExpanded] = useState(false);
  const [confirmedStandards, setConfirmedStandards] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['General', 'Qualitative', 'Quantitative', 'Literature Review', 'Other']));
  const [finalizedChecklist, setFinalizedChecklist] = useState<any>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [checklistAnswerData, setChecklistAnswerData] = useState<any>(null);
  const [isRunningChecklistAnswering, setIsRunningChecklistAnswering] = useState(false);
  const [checklistAnswerError, setChecklistAnswerError] = useState('');
  const [expandedChecklistStandards, setExpandedChecklistStandards] = useState<Set<string>>(new Set());
  const [checklistAnswerFilter, setChecklistAnswerFilter] = useState<'no' | 'unknown' | 'yes' | null>(null);
  const checklistAnswerFileRef = useRef<HTMLInputElement>(null);

  const STANDARDS_BY_CATEGORY = {
    General: [
      'Engineering Research',
      'Multimethodology or mixed methods',
    ],
    Qualitative: [
      'Action Research',
      'Case Study',
      'Grounded Theory',
      'Qualitative Survey',
    ],
    Quantitative: [
      'Benchmarking',
      'Data Science',
      'Experiment with human participants',
      'Optimization Study',
      'Quantitative Longitudinal Study',
      'Quantitative Simulation',
      'Questionnaire Survey',
      'Repository Mining',
    ],
    'Literature Review': [
      'Case Survey',
      'Systematic Literature Review',
    ],
    Other: [
      'Meta Science',
      'Replication',
      'Empirical Method Not Listed Above',
    ],
  } as Record<string, string[]>;

  const AI_PHASES = [
    { at: 0,  msg: 'Uploading PDF to agent…' },
    { at: 4,  msg: 'Agent is reading the paper…' },
    { at: 12, msg: 'Analyzing content and generating feedback…' },
    { at: 22, msg: 'Annotating PDF…' },
    { at: 32, msg: 'Downloading annotated PDF…' },
    { at: 42, msg: 'Almost done…' },
  ];

  const handleAIFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRunningAI(true);
    setAiError('');
    setAiStatus(AI_PHASES[0].msg);

    const start = Date.now();
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const phase = [...AI_PHASES].reverse().find(p => elapsed >= p.at);
      if (phase) setAiStatus(phase.msg);
    }, 1000);

    try {
      const res = await startAIReviewRequest(round.id, file);
      const aiReviewData = res.data?.aiReview;

      // Normalize the response format for local display
      setLocalAiResult({
        reviewText: aiReviewData?.summaryReport,
        annotatedPdfUrl: aiReviewData?.annotatedPdfUrl,
        checklistJson: aiReviewData?.checklist,
        checklistUrl: aiReviewData?.checklistUrl,
        suggestedCitations: aiReviewData?.suggestedCitations
      });

      if (aiReviewData?.checklist?.selectedStandards) {
        const standards = new Set<string>(aiReviewData.checklist.selectedStandards.map((s: any) => s.label));
        setConfirmedStandards(standards);
      }
      setAiStatus('');
      onRefresh();
    } catch (err: any) {
      setAiError(err.message || 'AI Review failed');
      setAiStatus('');
    } finally {
      clearInterval(ticker);
      setRunningAI(false);
    }
  };

  const handleComplianceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRunningCompliance(true);
    setComplianceError('');

    try {
      const res = await runComplianceCheckRequest(round.id, file);
      setLocalComplianceResult(res.data);
      onRefresh();
    } catch (err: any) {
      setComplianceError(err.message || 'Compliance check failed');
    } finally {
      setRunningCompliance(false);
    }
  };

  // Initialize confirmed standards when round data loads
  useEffect(() => {
    // If already confirmed, show that state
    if (round.confirmedChecklistJson?.selectedStandards) {
      setFinalizedChecklist(round.confirmedChecklistJson);
      return;
    }

    // Otherwise, pre-select AI-selected standards from local result or round data
    if (confirmedStandards.size === 0) {
      const checklist = localAiResult?.checklistJson || round.checklistJson;
      if (checklist?.selectedStandards) {
        const standards = new Set<string>(checklist.selectedStandards.map((s: any) => s.label));
        setConfirmedStandards(standards);
      }
    }
  }, [round.checklistJson, round.confirmedChecklistJson, localAiResult]);

  useEffect(() => {
    if (round.confirmedChecklistJson?.selectedStandards) {
      getEmpiricalChecklistAnswersRequest(round.id)
        .then(res => { if (res?.data) setChecklistAnswerData(res.data); })
        .catch(() => {});
    }
  }, [round.id, round.confirmedChecklistJson]);

  const pendingCount = round.assignments.filter(
    a => a.pendingDeclineRequest || a.pendingExtensionRequest,
  ).length;
  const draftReviewerCount = proposedReviewers.length + round.assignments.length;

  return (
    <div className="glass rounded-2xl border border-white/5 overflow-hidden">
      {/* Round header */}
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-sm font-bold">
            {round.roundNumber}
          </div>
          <div>
            <p className="text-white font-semibold">{round.targetVenue || `Round ${round.roundNumber}`}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Deadline: {formatDate(round.deadline)} · {round.assignments.length} reviewer(s)
              {pendingCount > 0 && (
                <span className="ml-2 text-amber-400">· {pendingCount} pending request(s)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={round.status} />
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-6 py-4 space-y-4">
          {round.status === 'Draft' && (
            <div className={`p-4 rounded-xl mb-4 space-y-4 ${round.createdByCoordinator ? 'border border-blue-500/20 bg-blue-500/5' : 'border border-amber-500/20 bg-amber-500/5'}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className={`text-sm font-semibold ${round.createdByCoordinator ? 'text-blue-400' : 'text-amber-400'}`}>
                    {round.createdByCoordinator ? 'Configure & Start Round' : 'Draft Round — Pending Your Approval'}
                  </h3>
                  {!round.createdByCoordinator && (
                    <p className="text-xs text-slate-400 mt-0.5">An author proposed this round. Review the configuration below, then approve to start.</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {!paperHasOverleafLink && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Set the Overleaf link before approving
                    </p>
                  )}
                  {!round.targetVenueUrl?.trim() && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Set the venue URL before approving
                    </p>
                  )}
                  {approveMsg && <p className="text-xs text-emerald-400">{approveMsg}</p>}
                  {approveError && <p className="text-xs text-red-400 max-w-xs text-right">{approveError}</p>}
                  <button
                    onClick={handleApproveRound}
                    disabled={approving || !paperHasOverleafLink || !round.targetVenueUrl?.trim() || draftReviewerCount === 0}
                    title={draftReviewerCount === 0 ? 'Add at least one reviewer before starting' : undefined}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {round.createdByCoordinator ? 'Assign Reviewers & Start' : 'Approve & Start Round'}
                  </button>
                </div>
              </div>

              {/* Round config info */}
              <div className="rounded-lg border border-white/5 bg-white/[0.015] px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Venue Details</p>
                  {!editingDetails && (
                    <button
                      onClick={() => { setDraftVenueName(round.targetVenue || ''); setDraftVenueUrl(round.targetVenueUrl || ''); setDraftVenueCategory(round.venueCategory === 'Journal' ? 'Journal' : 'Conference'); setDetailsError(''); setEditingDetails(true); }}
                      className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-500/20"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3">
                    <p className="text-slate-500 text-xs">Target Venue</p>
                    {editingDetails ? (
                      <input type="text" value={draftVenueName} onChange={(e) => setDraftVenueName(e.target.value)} placeholder="Venue name" className="bg-background border border-white/10 rounded px-2 py-1 text-xs text-white w-full" />
                    ) : (
                      <p className="text-sm text-white truncate">{round.targetVenue || '—'}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3">
                    <p className="text-slate-500 text-xs">Venue URL</p>
                    {editingDetails ? (
                      <input type="url" value={draftVenueUrl} onChange={(e) => setDraftVenueUrl(e.target.value)} placeholder="https://venue.example" className="bg-background border border-white/10 rounded px-2 py-1 text-xs text-white w-full" />
                    ) : round.targetVenueUrl ? (
                      <a href={round.targetVenueUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-sm truncate block">{round.targetVenueUrl}</a>
                    ) : (
                      <p className="text-slate-500 text-sm">—</p>
                    )}
                  </div>
                  <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3">
                    <p className="text-slate-500 text-xs">Venue Category</p>
                    {editingDetails ? (
                      <select value={draftVenueCategory} onChange={(e) => setDraftVenueCategory(e.target.value as 'Conference' | 'Journal')} className="bg-background border border-white/10 rounded px-2 py-1 text-xs text-white w-full">
                        <option value="Conference">Conference</option>
                        <option value="Journal">Journal</option>
                      </select>
                    ) : (
                      <p className="text-sm text-white">{round.venueCategory || '—'}</p>
                    )}
                  </div>
                </div>
                {editingDetails && (
                <div className="pt-2 border-t border-white/5 space-y-2">
                  {detailsError && <p className="text-xs text-red-400">{detailsError}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleSaveDetails} disabled={savingDetails || !draftVenueName.trim() || !draftVenueUrl.trim()} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50">{savingDetails ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => setEditingDetails(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
                  </div>
                </div>
                )}
              </div>
              {/* Reviewers section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {round.createdByCoordinator ? 'Reviewers' : 'Proposed Reviewers'} {loadingProposed ? '…' : `(${proposedReviewers.length})`}
                  </p>
                  <button
                    onClick={() => showProposePanel ? setShowProposePanel(false) : openProposePanel()}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-1 rounded"
                  >
                    <UserPlus className="w-3 h-3" /> Add
                  </button>
                </div>

                {proposedReviewers.length === 0 && !loadingProposed && (
                  <p className="text-xs text-slate-500 italic">
                    {round.createdByCoordinator
                      ? 'No reviewers added yet. Select from the suggestions below.'
                      : 'No reviewers proposed yet. Authors or you can add from suggestions.'}
                  </p>
                )}
                {proposedReviewers.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">
                        {r.name.charAt(0)}
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm text-white truncate">{r.name}</span>
                        {r.hasPreviouslyCompletedReview && <PriorReviewIndicator />}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!round.createdByCoordinator && (
                        <button
                          onClick={() => handleApproveProposed(r.id)}
                          disabled={approvingProposedId === r.id}
                          className="text-slate-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                          title="Assign reviewer to this round"
                        >
                          {approvingProposedId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveProposed(r.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                        title="Remove reviewer"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {proposeError && <p className="text-xs text-red-400">{proposeError}</p>}

                {showProposePanel && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-400">Select from eligible reviewers:</p>
                    {loadingProposeSuggestions ? (
                      <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                      </div>
                    ) : proposeSuggestions.length === 0 ? (
                      <p className="text-xs text-slate-500">No more eligible reviewers available.</p>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {proposeSuggestions.map(s => (
                          <div key={s.user.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02]">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-sm text-white truncate">{s.user.name}</p>
                                {s.hasPreviouslyCompletedReview && <PriorReviewIndicator />}
                              </div>
                              <p className="text-xs text-slate-500 truncate">{s.user.email}</p>
                            </div>
                            <button
                              onClick={() => handleAddProposed(s.user.id)}
                              className="ml-2 flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 transition-colors shrink-0"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setShowProposePanel(false)} className="text-xs text-slate-500 hover:text-slate-300">Close</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Deadline fields — editable for Draft and Open rounds */}
          {round.status !== 'Completed' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {round.venueCategory === 'Conference' && (
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Submission Deadline</p>
                  {!editingSubmissionDeadline ? (
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium">{formatDate(round.submissionDeadline)}</p>
                      <button onClick={() => { setDraftSubmissionDeadline(round.submissionDeadline ? toLocalDateInput(round.submissionDeadline) : ''); setEditingSubmissionDeadline(true); }} className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded">Edit</button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <input type="date" value={draftSubmissionDeadline} onChange={(e) => { setDraftSubmissionDeadline(e.target.value); setSubmissionDeadlineError(''); }} min={maxDateInputValue(todayInputValue(), draftDeadline || (round.deadline ? toLocalDateInput(round.deadline) : undefined))} className="bg-background border border-white/10 rounded px-2 py-1 text-xs text-white" />
                        <button onClick={handleEditSubmissionDeadline} disabled={savingSubmissionDeadline || !draftSubmissionDeadline} className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-xs text-white disabled:opacity-50">Save</button>
                        <button onClick={async () => { if (await confirmCancel()) { setEditingSubmissionDeadline(false); setSubmissionDeadlineError(''); } }} className="text-slate-400 hover:text-slate-300 text-xs">Cancel</button>
                      </div>
                      {submissionDeadlineError && <p className="text-xs text-red-400">{submissionDeadlineError}</p>}
                    </div>
                  )}
                </div>
              )}
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Round Deadline</p>
                {!editingDeadline ? (
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium">{formatDate(round.deadline)}</p>
                    <button onClick={() => { setDraftDeadline(round.deadline ? toLocalDateInput(round.deadline) : ''); setEditingDeadline(true); }} className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded">Edit</button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input type="date" value={draftDeadline} onChange={(e) => { setDraftDeadline(e.target.value); setDeadlineError(''); }} min={todayInputValue()} max={round.submissionDeadline ? toLocalDateInput(round.submissionDeadline) : undefined} className="bg-background border border-white/10 rounded px-2 py-1 text-xs text-white" />
                      <button onClick={handleEditDeadline} disabled={savingDeadline || !draftDeadline} className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-xs text-white disabled:opacity-50">Save</button>
                      <button onClick={async () => { if (await confirmCancel()) { setEditingDeadline(false); setDeadlineError(''); } }} className="text-slate-400 hover:text-slate-300 text-xs">Cancel</button>
                    </div>
                    {deadlineError && <p className="text-xs text-red-400">{deadlineError}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status summary panel (Open rounds) */}
          {round.status === 'Open' && (
            <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Activity className="w-3.5 h-3.5 text-blue-400" />
                  Review Progress
                </div>
                <button
                  onClick={loadStatus}
                  disabled={loadingStatus}
                  className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 disabled:opacity-50"
                >
                  {loadingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Refresh
                </button>
              </div>

              {statusSummary && (
                <>
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{statusSummary.summary.completed} / {statusSummary.summary.total} completed</span>
                      <span className="font-semibold text-white">{statusSummary.summary.completionRate}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${statusSummary.summary.completionRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Alert chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {statusSummary.summary.overdueCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        {statusSummary.summary.overdueCount} overdue
                      </span>
                    )}
                    {statusSummary.summary.approachingDeadlineCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-400">
                        <Clock className="w-3 h-3" />
                        {statusSummary.summary.approachingDeadlineCount} due within 3 days
                      </span>
                    )}
                    {statusSummary.summary.pendingDeclineRequests > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-orange-500/30 bg-orange-500/10 text-orange-400">
                        <XCircle className="w-3 h-3" />
                        {statusSummary.summary.pendingDeclineRequests} decline request(s)
                      </span>
                    )}
                    {statusSummary.summary.pendingExtensionRequests > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-sky-500/30 bg-sky-500/10 text-sky-400">
                        <Calendar className="w-3 h-3" />
                        {statusSummary.summary.pendingExtensionRequests} extension request(s)
                      </span>
                    )}
                    {statusSummary.summary.overdueCount === 0 && statusSummary.summary.approachingDeadlineCount === 0 && statusSummary.summary.pendingDeclineRequests === 0 && statusSummary.summary.pendingExtensionRequests === 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        All on track
                      </span>
                    )}
                  </div>

                  {/* Overdue list */}
                  {statusSummary.overdueAssignments.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Overdue Reviewers</p>
                      {statusSummary.overdueAssignments.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5 text-xs">
                          <div>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-white font-medium">{a.reviewer.name}</span>
                              {a.hasPreviouslyCompletedReview && <PriorReviewIndicator />}
                            </span>
                            <span className="text-slate-500 ml-2">{a.reviewer.email}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-red-400">{formatDate(a.deadline)}</span>
                            <StatusBadge status={a.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Approaching deadline list */}
                  {statusSummary.approachingDeadline.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Deadlines Approaching</p>
                      {statusSummary.approachingDeadline.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs">
                          <div>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-white font-medium">{a.reviewer.name}</span>
                              {a.hasPreviouslyCompletedReview && <PriorReviewIndicator />}
                            </span>
                            <span className="text-slate-500 ml-2">{a.reviewer.email}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-amber-400">{formatDate(a.deadline)}</span>
                            <StatusBadge status={a.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {loadingStatus && !statusSummary && (
                <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading status…
                </div>
              )}
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3">
            {canAddReviewer && (
              <button
                onClick={() => showAddPanel ? setShowAddPanel(false) : openAddPanel()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add Reviewer
              </button>
            )}
            {assignMsg && <p className="text-xs text-emerald-400">{assignMsg}</p>}
          </div>

          {/* Add reviewer panel */}
          {showAddPanel && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {reassigningForId ? 'Select Replacement Reviewer' : 'Select reviewers to assign'}
              </p>
              {loadingSuggestions ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading suggestions...
                </div>
              ) : suggestError ? (
                <p className="text-xs text-red-400">{suggestError}</p>
              ) : suggestions.length === 0 ? (
                <p className="text-xs text-slate-500">No eligible reviewers found for this round.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {suggestions.map(s => (
                    <label
                      key={s.user.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedIds.has(s.user.id)
                          ? 'border-blue-500/40 bg-blue-500/10'
                          : 'border-white/5 bg-white/[0.02] hover:bg-white/5'
                      }`}
                    >
                      <input
                        type={reassigningForId ? "radio" : "checkbox"}
                        name="reviewerSelect"
                        checked={selectedIds.has(s.user.id)}
                        onChange={() => toggleSelect(s.user.id)}
                        className="accent-blue-500 w-4 h-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{s.user.name}</p>
                          {s.hasPreviouslyCompletedReview && <PriorReviewIndicator />}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{s.user.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleAssign}
                  disabled={selectedIds.size === 0 || assigning}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {reassigningForId ? 'Reassign' : `Assign ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                </button>
                <button onClick={async () => { if (await confirmCancel()) setShowAddPanel(false); }} className="text-xs text-slate-500 hover:text-slate-300">
                  Cancel
                </button>
                {assignError && <p className="text-xs text-red-400">{assignError}</p>}
              </div>
            </div>
          )}

          {/* Assignments */}
          {round.assignments.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-white/10 rounded-xl text-slate-500 text-sm">
              No reviewers assigned to this round yet.
            </div>
          ) : (
            <div className="space-y-2">
              {round.assignments.map(a => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  roundDeadline={round.deadline}
                  roundStatus={round.status}
                  onRefresh={onRefresh}
                  onReassign={openAddPanel}
                />
              ))}
            </div>
          )}

          {round.status !== 'Draft' && (
            <>
              {/* AI Tools */}
              <div className="pt-3 border-t border-white/5 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => aiFileRef.current?.click()}
                    disabled={runningAI}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {runningAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                    {runningAI ? 'Running…' : 'Run AI Review'}
                  </button>
                  {aiStatus && (
                    <span className="text-xs text-indigo-300 animate-pulse">{aiStatus}</span>
                  )}
                  {aiError && <p className="text-xs text-red-400">{aiError}</p>}
                </div>

                {/* AI Review History */}
                {(() => {
                  const reviews = round.aiReviewReports || [];
                  const recentReport = localAiResult || round.aiReviewReport;

                  if (reviews.length === 0 && !recentReport) return null;

                  return (
                    <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-2">
                      <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">AI Review History</p>

                      {reviews.length > 0 ? (
                        <div className="space-y-2">
                          {reviews.map((review, idx) => (
                            <div key={review.id} className="rounded-lg bg-slate-800/30 overflow-hidden">
                              <button
                                onClick={() => setExpandedReviewId(expandedReviewId === review.id ? null : review.id)}
                                className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-800/50 transition-colors"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-xs text-slate-400">Review #{reviews.length - idx}</span>
                                  <span className="text-[10px] text-slate-500">{new Date(review.createdAt).toLocaleString()}</span>
                                  {review.venue && (
                                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">{review.venue}</span>
                                  )}
                                  {review.annotatedPdfUrl && (
                                    <a
                                      href={review.annotatedPdfUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-[10px] bg-indigo-500/30 text-indigo-300 hover:bg-indigo-500/50 px-2 py-0.5 rounded transition-colors"
                                    >
                                      <Download className="w-3 h-3" /> PDF
                                    </a>
                                  )}
                                </div>
                                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${expandedReviewId === review.id ? 'rotate-180' : ''}`} />
                              </button>

                              {expandedReviewId === review.id && (
                                <div className="px-2 py-2 border-t border-slate-700/50 bg-slate-800/20 space-y-2 max-h-96 overflow-y-auto">
                                  <div className="text-xs text-slate-300 leading-relaxed markdown-content whitespace-pre-wrap">
                                    <ReactMarkdown
                                      components={{
                                        h1: ({node, ...props}) => <h1 className="text-sm font-bold text-slate-100 mt-3 mb-2" {...props} />,
                                        h2: ({node, ...props}) => <h2 className="text-xs font-bold text-slate-100 mt-2 mb-1" {...props} />,
                                        h3: ({node, ...props}) => <h3 className="text-xs font-semibold text-slate-100 mt-2 mb-1" {...props} />,
                                        h4: ({node, ...props}) => <h4 className="text-xs font-semibold text-slate-200 mt-1 mb-1" {...props} />,
                                        p: ({node, ...props}) => <p className="text-xs text-slate-300 mb-1" {...props} />,
                                        ul: ({node, ...props}) => <ul className="text-xs text-slate-300 list-disc list-inside mb-1" {...props} />,
                                        ol: ({node, ...props}) => <ol className="text-xs text-slate-300 list-decimal list-inside mb-1" {...props} />,
                                        li: ({node, ...props}) => <li className="text-xs text-slate-300 ml-2" {...props} />,
                                        strong: ({node, ...props}) => <strong className="text-slate-100 font-semibold" {...props} />,
                                        em: ({node, ...props}) => <em className="italic text-slate-200" {...props} />,
                                      }}
                                    >
                                      {review.reviewText}
                                    </ReactMarkdown>
                                  </div>
                                  {review.annotatedPdfUrl && (
                                    <a href={review.annotatedPdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                                      <Download className="w-3 h-3" /> Download Annotated PDF
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : recentReport ? (
                        <div className="p-2 rounded-lg bg-slate-800/30 space-y-2 max-h-96 overflow-y-auto">
                          <div className="text-xs text-slate-300 leading-relaxed markdown-content whitespace-pre-wrap">
                            <ReactMarkdown
                              components={{
                                h1: ({node, ...props}) => <h1 className="text-sm font-bold text-slate-100 mt-3 mb-2" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-xs font-bold text-slate-100 mt-2 mb-1" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-xs font-semibold text-slate-100 mt-2 mb-1" {...props} />,
                                h4: ({node, ...props}) => <h4 className="text-xs font-semibold text-slate-200 mt-1 mb-1" {...props} />,
                                p: ({node, ...props}) => <p className="text-xs text-slate-300 mb-1" {...props} />,
                                ul: ({node, ...props}) => <ul className="text-xs text-slate-300 list-disc list-inside mb-1" {...props} />,
                                ol: ({node, ...props}) => <ol className="text-xs text-slate-300 list-decimal list-inside mb-1" {...props} />,
                                li: ({node, ...props}) => <li className="text-xs text-slate-300 ml-2" {...props} />,
                                strong: ({node, ...props}) => <strong className="text-slate-100 font-semibold" {...props} />,
                                em: ({node, ...props}) => <em className="italic text-slate-200" {...props} />,
                              }}
                            >
                              {typeof recentReport === 'string' ? recentReport : (recentReport.reviewText || 'Review text not available')}
                            </ReactMarkdown>
                          </div>
                          {recentReport?.annotatedPdfUrl && (
                            <a href={recentReport.annotatedPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                              <Download className="w-3 h-3" /> Download Annotated PDF
                            </a>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Compliance result */}
                {(() => {
                  const comp = round.complianceReport;
                  if (!comp) return null;

                  const entries = Object.entries(comp) as [string, any][];
                  const passCount = entries.filter(([, v]) => v.status === 'pass').length;
                  const failCount = entries.filter(([, v]) => v.status === 'fail').length;
                  const unknownCount = entries.filter(([, v]) => v.status === 'unknown').length;

                  return (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
                      {/* Clickable header */}
                      <button
                        onClick={() => setComplianceExpanded(v => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-emerald-500/5 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`w-3 h-3 text-emerald-500/60 transition-transform ${complianceExpanded ? '' : '-rotate-90'}`} />
                          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Compliance Check</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {failCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{failCount} fail</span>}
                          {unknownCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">{unknownCount} ?</span>}
                          {passCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{passCount} pass</span>}
                        </div>
                      </button>

                      {/* Expanded details */}
                      {complianceExpanded && (
                        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-2 border-t border-emerald-500/10">
                          {entries.map(([key, val]) => {
                            let icon;
                            if (val.status === 'pass') {
                              icon = <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />;
                            } else if (val.status === 'fail') {
                              icon = <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />;
                            } else if (val.status === 'skipped') {
                              icon = <AlertCircle className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />;
                            } else {
                              icon = <AlertCircle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />;
                            }
                            return (
                              <div key={key} className="flex items-start gap-1.5">
                                {icon}
                                <div>
                                  <p className="text-[10px] text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                                  <p className="text-[10px] text-slate-300">{val.status === 'skipped' ? 'Not applicable' : (val.details || val.status)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Empirical Standards result */}
                {(() => {
                  const checklist = localAiResult?.checklistJson || round.checklistJson;
                  if (!checklist?.selectedStandards?.length) return null;

                  const aiSelectedMap = new Map<string, { label: string; confidence: string; evidence: string }>(
                    checklist.selectedStandards.map((s: any) => [s.label, s])
                  );

                  const buildChecklistUrl = (standards: Set<string>) => {
                    const base = "https://www2.sigsoft.org/EmpiricalStandards/form_generator/result.html";
                    const params = new URLSearchParams();
                    Array.from(standards).forEach(standard => params.append("standard", standard));
                    params.append("role", "author");
                    return `${base}?${params.toString()}`;
                  };

                  const handleConfirm = async () => {
                    try {
                      const selectedStandardsArray = Array.from(confirmedStandards);
                      await confirmChecklistSelectionRequest(round.id, selectedStandardsArray);
                      setFinalizedChecklist({
                        selectedStandards: selectedStandardsArray,
                        confirmedAt: new Date().toISOString(),
                      });
                      onRefresh();
                    } catch (err) {
                      console.error('Failed to confirm checklist:', err);
                      alert('Failed to confirm checklist. Please try again.');
                    }
                  };

                  return (
                    <div className="p-3 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Empirical Standards</p>
                        {!finalizedChecklist && (
                          <div className="flex items-center gap-2">
                            <a
                              href={buildChecklistUrl(confirmedStandards)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" /> Open Form
                            </a>
                            <button
                              onClick={handleConfirm}
                              disabled={confirmedStandards.size === 0}
                              className="px-2 py-1 text-xs font-medium rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Confirm Checklist
                            </button>
                          </div>
                        )}
                      </div>

                      {finalizedChecklist ? (
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                          <div>
                            <p className="text-xs text-emerald-300 font-medium">✓ Checklist confirmed</p>
                            <p className="text-[10px] text-emerald-300/70 mt-1">{finalizedChecklist.selectedStandards.length} standards selected</p>
                          </div>
                          <button
                            onClick={() => {
                              setFinalizedChecklist(null);
                              setConfirmedStandards(new Set(finalizedChecklist.selectedStandards));
                            }}
                            className="px-2 py-1 text-xs rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                            title="Update checklist selection"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(Object.entries(STANDARDS_BY_CATEGORY) as Array<[string, string[]]>).map(([category, standards]) => (
                            <div key={category} className="rounded-lg bg-slate-800/30 overflow-hidden">
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedCategories);
                                  if (newExpanded.has(category)) {
                                    newExpanded.delete(category);
                                  } else {
                                    newExpanded.add(category);
                                  }
                                  setExpandedCategories(newExpanded);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800/50 transition-colors"
                              >
                                <ChevronDown
                                  className={`w-3 h-3 text-slate-400 transition-transform ${expandedCategories.has(category) ? '' : '-rotate-90'}`}
                                />
                                <p className="text-xs font-semibold text-slate-300">{category}</p>
                                <span className="text-[10px] text-slate-500 ml-auto">
                                  {standards.filter(s => confirmedStandards.has(s)).length}/{standards.length}
                                </span>
                              </button>

                              {expandedCategories.has(category) && (
                                <div className="px-2 py-1.5 space-y-1 border-t border-slate-700/50">
                                  {standards.map((standard) => {
                                    const aiData = aiSelectedMap.get(standard);
                                    return (
                                      <div key={standard} className="flex items-start gap-2 p-1.5 rounded bg-slate-900/50 hover:bg-slate-900/75 transition-colors">
                                        <input
                                          type="checkbox"
                                          checked={confirmedStandards.has(standard)}
                                          onChange={(e) => {
                                            const newConfirmed = new Set<string>(confirmedStandards);
                                            if (e.target.checked) {
                                              newConfirmed.add(standard);
                                            } else {
                                              newConfirmed.delete(standard);
                                            }
                                            setConfirmedStandards(newConfirmed);
                                          }}
                                          className="mt-0.5 cursor-pointer"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="text-xs text-slate-200 font-medium">{standard}</p>
                                            {aiData && (
                                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                                                aiData.confidence === 'high'
                                                  ? 'bg-emerald-500/20 text-emerald-300'
                                                  : aiData.confidence === 'medium'
                                                  ? 'bg-amber-500/20 text-amber-300'
                                                  : 'bg-orange-500/20 text-orange-300'
                                              }`}>
                                                {aiData.confidence}
                                              </span>
                                            )}
                                          </div>
                                          {aiData && (
                                            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{aiData.evidence}</p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Empirical Standards Checklist Answers */}
              {finalizedChecklist && (
                <div className="mt-3 rounded-xl bg-slate-900/50 border border-slate-700/50 p-3 space-y-2">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Checklist Answers</p>
                    {checklistAnswerData && (() => {
                      const answers = checklistAnswerData.answers ?? [];
                      const no = answers.filter((a: any) => a.answer === 'no').length;
                      const unknown = answers.filter((a: any) => a.answer === 'unknown').length;
                      const yes = answers.filter((a: any) => a.answer === 'yes').length;
                      return (
                        <div className="flex items-center gap-1.5">
                          {no > 0 && (
                            <button
                              onClick={() => setChecklistAnswerFilter(f => f === 'no' ? null : 'no')}
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${checklistAnswerFilter === 'no' ? 'bg-red-500/40 text-red-200 ring-1 ring-red-400/50' : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'}`}
                            >{no} no</button>
                          )}
                          {unknown > 0 && (
                            <button
                              onClick={() => setChecklistAnswerFilter(f => f === 'unknown' ? null : 'unknown')}
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${checklistAnswerFilter === 'unknown' ? 'bg-slate-500/40 text-slate-200 ring-1 ring-slate-400/50' : 'bg-slate-500/20 text-slate-400 hover:bg-slate-500/30'}`}
                            >{unknown} ?</button>
                          )}
                          {yes > 0 && (
                            <button
                              onClick={() => setChecklistAnswerFilter(f => f === 'yes' ? null : 'yes')}
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${checklistAnswerFilter === 'yes' ? 'bg-emerald-500/40 text-emerald-200 ring-1 ring-emerald-400/50' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
                            >{yes} yes</button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Re-run button — only shown when results exist */}
                  {checklistAnswerData && (
                    <button
                      onClick={() => checklistAnswerFileRef.current?.click()}
                      disabled={isRunningChecklistAnswering}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/10 text-violet-400 border border-violet-500/20 hover:bg-violet-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[11px] font-medium"
                    >
                      {isRunningChecklistAnswering ? <><Loader2 className="w-3 h-3 animate-spin" /> Running…</> : <><Cpu className="w-3 h-3" /> Run again</>}
                    </button>
                  )}

                  {checklistAnswerError && (
                    <p className="text-[11px] text-red-400 bg-red-500/10 rounded-lg p-2">{checklistAnswerError}</p>
                  )}

                  {!checklistAnswerData ? (
                    <button
                      onClick={() => checklistAnswerFileRef.current?.click()}
                      disabled={isRunningChecklistAnswering}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                    >
                      {isRunningChecklistAnswering ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Answering checklist…</>
                      ) : (
                        <><Cpu className="w-3 h-3" /> Run Checklist Answering</>
                      )}
                    </button>
                  ) : (() => {
                    const answerOrder: Record<string, number> = { no: 0, unknown: 1, yes: 2 };
                    const answerMap = new Map<string, any>(
                      (checklistAnswerData.answers ?? []).map((a: any) => [a.itemId, a])
                    );

                    // Group items: standard → section → entries[], sorted no first
                    const grouped = new Map<string, Map<string, any[]>>();
                    for (const item of (checklistAnswerData.items ?? [])) {
                      const std = item.standard;
                      const sec = item.sectionTitle ?? 'General';
                      if (!grouped.has(std)) grouped.set(std, new Map());
                      if (!grouped.get(std)!.has(sec)) grouped.get(std)!.set(sec, []);
                      grouped.get(std)!.get(sec)!.push({ item, answer: answerMap.get(item.id) });
                    }

                    // Sort entries within each section: no → unknown → yes
                    grouped.forEach(sections => {
                      sections.forEach((entries, sec) => {
                        sections.set(sec, entries.sort((a: any, b: any) =>
                          (answerOrder[a.answer?.answer] ?? 1) - (answerOrder[b.answer?.answer] ?? 1)
                        ));
                      });
                    });

                    return (
                      <div className="space-y-1.5">
                        {Array.from(grouped.entries()).map(([standard, sections]) => {
                          const stdAnswers = Array.from(sections.values()).flat().map((e: any) => e.answer?.answer);
                          const noCount = stdAnswers.filter(a => a === 'no').length;
                          const unknownCount = stdAnswers.filter(a => a === 'unknown').length;
                          const yesCount = stdAnswers.filter(a => a === 'yes').length;

                          // When filter active, skip standards with no matching items
                          if (checklistAnswerFilter && !stdAnswers.includes(checklistAnswerFilter)) return null;

                          // Auto-expand when filter is active
                          const isExpanded = checklistAnswerFilter ? true : expandedChecklistStandards.has(standard);

                          return (
                            <div key={standard} className="rounded-lg bg-slate-800/40 overflow-hidden border border-slate-700/30">
                              {/* Standard header — clickable to expand/collapse */}
                              <button
                                onClick={() => {
                                  const next = new Set(expandedChecklistStandards);
                                  if (next.has(standard)) next.delete(standard);
                                  else next.add(standard);
                                  setExpandedChecklistStandards(next);
                                }}
                                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-800/60 hover:bg-slate-800/80 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                                  <p className="text-[11px] font-semibold text-slate-300">{standard}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {noCount > 0 && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-300">{noCount}✗</span>}
                                  {unknownCount > 0 && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-500/20 text-slate-400">{unknownCount}?</span>}
                                  {yesCount > 0 && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{yesCount}✓</span>}
                                </div>
                              </button>

                              {/* Expanded content */}
                              {isExpanded && Array.from(sections.entries()).map(([section, entries]) => {
                                const visibleEntries = checklistAnswerFilter
                                  ? entries.filter((e: any) => e.answer?.answer === checklistAnswerFilter)
                                  : entries;
                                if (visibleEntries.length === 0) return null;
                                return (
                                <div key={section} className="px-2.5 py-2 space-y-1.5 border-t border-slate-700/40">
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{section}</p>
                                  {visibleEntries.map(({ item, answer }: any) => (
                                    <div key={item.id} className="flex items-start gap-2">
                                      <span className={`shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded min-w-[32px] text-center ${
                                        answer?.answer === 'yes'
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : answer?.answer === 'no'
                                          ? 'bg-red-500/20 text-red-300'
                                          : 'bg-slate-500/20 text-slate-400'
                                      }`}>
                                        {answer?.answer?.toUpperCase() ?? '?'}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-slate-300 leading-relaxed">{item.itemText}</p>
                                        {answer?.evidence && (
                                          <p className="text-[9px] text-slate-500 mt-0.5 italic leading-relaxed">{answer.evidence}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Hidden file inputs */}
              <input ref={aiFileRef} type="file" accept="application/pdf" className="hidden" onChange={handleAIFileSelected} />
              <input
                ref={checklistAnswerFileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = '';
                  setIsRunningChecklistAnswering(true);
                  setChecklistAnswerError('');
                  try {
                    const res = await runEmpiricalChecklistAnsweringRequest(round.id, file);
                    if (res.data) setChecklistAnswerData(res.data);
                  } catch (err: any) {
                    setChecklistAnswerError(err.message || 'Checklist answering failed. Please try again.');
                  } finally {
                    setIsRunningChecklistAnswering(false);
                  }
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RoundsPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const manualPaperSelectionRef = useRef(false);
  const [papers, setPapers] = useState<CoordinatedPaper[]>([]);
  const [paperSearch, setPaperSearch] = useState('');
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundWithAssignments[]>([]);
  const [pendingRoundRequestsByPaper, setPendingRoundRequestsByPaper] = useState<Record<string, RoundWithAssignments[]>>({});
  const [loadingPapers, setLoadingPapers] = useState(true);
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [papersError, setPapersError] = useState('');
  const [roundsError, setRoundsError] = useState('');

  // Overleaf link editing
  const [editingOverleaf, setEditingOverleaf] = useState(false);
  const [overleafDraft, setOverleafDraft] = useState('');
  const [savingOverleaf, setSavingOverleaf] = useState(false);
  const [overleafError, setOverleafError] = useState('');

  // Create Draft State
  const [showCreateRound, setShowCreateRound] = useState(false);
  const [newRoundVenueCat, setNewRoundVenueCat] = useState('Conference');
  const [newRoundTargetVenue, setNewRoundTargetVenue] = useState('');
  const [newRoundTargetVenueUrl, setNewRoundTargetVenueUrl] = useState('');
  const [newRoundSubDeadline, setNewRoundSubDeadline] = useState('');
  const [newRoundDeadline, setNewRoundDeadline] = useState('');
  const [creatingRound, setCreatingRound] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!user.id) return;
    getMyCoordinatedPapersRequest()
      .then(async data => {
        setPapers(data);

        const pendingEntries = await Promise.all(
          data.map(async paper => {
            try {
              const paperRounds = await getPaperRoundsRequest(paper.id);
              return [
                paper.id,
                paperRounds.filter(round => round.status === 'Draft' && !round.createdByCoordinator),
              ] as const;
            } catch {
              return [paper.id, []] as const;
            }
          }),
        );

        setPendingRoundRequestsByPaper(Object.fromEntries(pendingEntries));
      })
      .catch(e => setPapersError(e instanceof ApiError ? e.message : 'Failed to load papers'))
      .finally(() => setLoadingPapers(false));
  }, [user.id]);

  const refreshSelectedPaperDetails = useCallback(async (paperId: string) => {
    try {
      const paper = await getPaperByIdRequest(paperId);
      setPapers(prev => prev.map(p => p.id === paperId ? {
        ...p,
        title: paper.title,
        status: paper.status,
        abstractText: paper.abstractText ?? p.abstractText,
        overleafLink: paper.overleafLink ?? null,
      } : p));
    } catch {
      // The coordinated-paper list is still usable if the detail refresh fails.
    }
  }, []);

  const loadRounds = useCallback((paperId: string) => {
    setLoadingRounds(true);
    setRoundsError('');
    setShowCreateRound(false);
    getPaperRoundsRequest(paperId)
      .then(paperRounds => {
        setRounds(paperRounds);
        setPendingRoundRequestsByPaper(prev => ({
          ...prev,
          [paperId]: paperRounds.filter(round => round.status === 'Draft' && !round.createdByCoordinator),
        }));
      })
      .catch(e => setRoundsError(e instanceof ApiError ? e.message : 'Failed to load rounds'))
      .finally(() => setLoadingRounds(false));
  }, []);

  const handleSelectPaper = (paperId: string) => {
    manualPaperSelectionRef.current = true;
    if (selectedPaperId === paperId) {
      router.replace('/rounds', { scroll: false });
      setSelectedPaperId(null);
      setRounds([]);
      setEditingOverleaf(false);
      setOverleafError('');
      setShowCreateRound(false);
      return;
    }

    router.replace(`/rounds?paper=${paperId}`, { scroll: false });
    setSelectedPaperId(paperId);
    setRounds([]);
    setEditingOverleaf(false);
    setOverleafError('');
    void refreshSelectedPaperDetails(paperId);
    loadRounds(paperId);
  };

  useEffect(() => {
    const paperId = searchParams.get('paper');
    if (manualPaperSelectionRef.current) {
      if (paperId === selectedPaperId || (!paperId && selectedPaperId === null)) {
        manualPaperSelectionRef.current = false;
      }
      return;
    }
    if (!paperId) {
      return;
    }
    if (loadingPapers || selectedPaperId === paperId) return;
    if (!papers.some(paper => paper.id === paperId)) return;

    setSelectedPaperId(paperId);
    setRounds([]);
    setEditingOverleaf(false);
    setOverleafError('');
    void refreshSelectedPaperDetails(paperId);
    loadRounds(paperId);
  }, [loadRounds, loadingPapers, papers, refreshSelectedPaperDetails, searchParams, selectedPaperId]);

  useEffect(() => {
    if (!selectedPaperId || loadingPapers) return;
    void refreshSelectedPaperDetails(selectedPaperId);
  }, [loadingPapers, refreshSelectedPaperDetails, selectedPaperId]);

  const handleSaveOverleaf = async () => {
    if (!selectedPaperId) return;
    setSavingOverleaf(true);
    setOverleafError('');
    try {
      const result = await updateOverleafLinkRequest(selectedPaperId, overleafDraft.trim());
      setPapers(prev => prev.map(p => p.id === selectedPaperId ? { ...p, overleafLink: result.overleafLink } : p));
      setEditingOverleaf(false);
    } catch (e) {
      setOverleafError(e instanceof ApiError ? e.message : 'Failed to save');
    } finally {
      setSavingOverleaf(false);
    }
  };


  const handleRefresh = () => {
    if (!selectedPaperId) return;
    void refreshSelectedPaperDetails(selectedPaperId);
    loadRounds(selectedPaperId);
  };

  const handleCreateRound = async () => {
    if (!selectedPaperId || !user.id) return;
    if (!newRoundTargetVenue.trim()) {
      setCreateError('Venue name is required.');
      return;
    }
    if (!newRoundTargetVenueUrl.trim()) {
      setCreateError('Venue URL is required.');
      return;
    }
    if (!/^https?:\/\/.+/i.test(newRoundTargetVenueUrl.trim())) {
      setCreateError('Venue URL must start with http:// or https://.');
      return;
    }
    if (newRoundVenueCat === 'Conference' && !newRoundSubDeadline) {
      setCreateError('Submission deadline is required for Conference rounds.');
      return;
    }
    setCreatingRound(true);
    setCreateError('');
    try {
      await createRoundRequest(
        selectedPaperId,
        newRoundTargetVenue.trim(),
        newRoundVenueCat,
        newRoundVenueCat === 'Conference' ? dateInputToUtcIso(newRoundSubDeadline) : undefined,
        newRoundDeadline ? dateInputToUtcIso(newRoundDeadline) : undefined,
        newRoundTargetVenueUrl.trim(),
      );
      setShowCreateRound(false);
      setNewRoundTargetVenue('');
      setNewRoundTargetVenueUrl('');
      setNewRoundSubDeadline('');
      setNewRoundDeadline('');
      handleRefresh();
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : 'Failed to create round');
    } finally {
      setCreatingRound(false);
    }
  };

  if (!user.isCoordinator) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
        <p className="text-slate-400">Only coordinators can access round management.</p>
      </div>
    );
  }

  const selectedPaper = papers.find(p => p.id === selectedPaperId);
  
  const latestRound = rounds.length > 0 ? rounds[0] : null;
  const canCreateNextRound = !latestRound || latestRound.status === 'Completed';

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-8 animate-in fade-in duration-500 mb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-blue-400" />
            Round Management
          </h1>
          <p className="text-slate-400 mt-2">Manage review rounds, assignments, and reviewer requests for your papers.</p>
        </div>
      </div>

      {/* Paper selector */}
      <section className="glass rounded-2xl border border-white/5 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Select a Paper</h2>
        {loadingPapers ? (
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
            Loading papers...
          </div>
        ) : papersError ? (
          <p className="text-sm text-red-400">{papersError}</p>
        ) : papers.length === 0 ? (
          <p className="text-sm text-slate-500">No papers assigned to you as coordinator.</p>
        ) : (
          <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by paper title or author name…"
              value={paperSearch}
              onChange={e => setPaperSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/40 focus:bg-white/5 transition-colors"
            />
          </div>
          {(() => {
            const q = paperSearch.trim().toLowerCase();
            const filtered = q
              ? papers.filter(p =>
                  p.title.toLowerCase().includes(q) ||
                  (p.authors ?? []).some(a => a.name.toLowerCase().includes(q))
                )
              : papers;
            return filtered.length === 0 ? (
              <p className="text-sm text-slate-500">No papers match your search.</p>
            ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(paper => (
              <button
                key={paper.id}
                onClick={() => handleSelectPaper(paper.id)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selectedPaperId === paper.id
                    ? 'border-blue-500/40 bg-blue-500/10'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20'
                }`}
              >
                <p className="text-sm font-semibold text-white line-clamp-2 mb-2">{paper.title}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 truncate">
                    {paper.authors?.length
                      ? paper.authors.map(a => a.name).join(', ')
                      : (paper.overleafLink ? 'Overleaf linked' : 'No Overleaf link')}
                  </span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs border ${statusColor(paper.status)}`}>
                    {paper.status}
                  </span>
                </div>
                {(pendingRoundRequestsByPaper[paper.id]?.length ?? 0) > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {pendingRoundRequestsByPaper[paper.id].length} round request pending
                  </div>
                )}
              </button>
            ))}
          </div>
            );
          })()}
          </>
        )}
      </section>

      {/* Rounds */}
      {selectedPaper && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              Rounds for <span className="text-blue-400">{selectedPaper.title}</span>
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/papers/${selectedPaper.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Paper Overview
              </Link>
              {canCreateNextRound && !showCreateRound && (
                 <button
                    onClick={() => setShowCreateRound(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                 >
                    <Plus className="w-4 h-4" />
                    {rounds.length === 0 ? 'Create Initial Round' : 'Create Next Round'}
                 </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {selectedPaper.overleafLink ? (
              <a href={selectedPaper.overleafLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
                <ExternalLink className="w-4 h-4" />
                Open Overleaf Manuscript
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-slate-500">
                <ExternalLink className="w-4 h-4" />
                No Overleaf link
              </span>
            )}
          </div>

          {showCreateRound && (
             <div className="glass rounded-2xl border border-blue-500/30 p-6 space-y-4 bg-blue-500/5">
               <h3 className="text-base font-semibold text-blue-400">Setup Draft Round</h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-xs text-slate-400 uppercase tracking-wider">Venue Category</label>
                   <select
                     value={newRoundVenueCat}
                     onChange={(e) => setNewRoundVenueCat(e.target.value)}
                     className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                   >
                     <option value="Conference">Conference</option>
                     <option value="Journal">Journal</option>
                   </select>
                 </div>
                 <div className="space-y-1">
                   <label className="text-xs text-slate-400 uppercase tracking-wider">Target Venue Name</label>
                   <input
                     type="text"
                     value={newRoundTargetVenue}
                     onChange={(e) => setNewRoundTargetVenue(e.target.value)}
                     placeholder="e.g. NeurIPS 2026"
                     className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                   />
                 </div>
                 <div className="space-y-1 sm:col-span-2">
                   <label className="text-xs text-slate-400 uppercase tracking-wider">Venue URL</label>
                   <input
                     type="url"
                     value={newRoundTargetVenueUrl}
                     onChange={(e) => setNewRoundTargetVenueUrl(e.target.value)}
                     placeholder="https://neurips.cc/Conferences/2026"
                     className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                   />
                 </div>
                 {newRoundVenueCat === 'Conference' && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase tracking-wider">Submission Deadline</label>
                      <input
                        type="date"
                        value={newRoundSubDeadline}
                        onChange={(e) => setNewRoundSubDeadline(e.target.value)}
                        min={todayInputValue()}
                        className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                 )}
                 <div className="space-y-1">
                   <label className="text-xs text-slate-400 uppercase tracking-wider">Round Deadline</label>
                   <input
                     type="date"
                     value={newRoundDeadline}
                     onChange={(e) => setNewRoundDeadline(e.target.value)}
                     min={todayInputValue()}
                     max={newRoundVenueCat === 'Conference' && newRoundSubDeadline ? newRoundSubDeadline : undefined}
                     className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                   />
                 </div>
               </div>
               {createError && <p className="text-xs text-red-400">{createError}</p>}
               <div className="flex gap-3 pt-2">
                 <button
                   onClick={handleCreateRound}
                   disabled={creatingRound || !newRoundTargetVenue.trim() || !newRoundTargetVenueUrl.trim() || (newRoundVenueCat === 'Conference' && !newRoundSubDeadline)}
                   className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
                 >
                   {creatingRound ? 'Saving...' : 'Create Draft'}
                 </button>
                 <button
                   onClick={async () => { if (await confirmCancel()) setShowCreateRound(false); }}
                   className="px-4 py-2 text-sm font-medium rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition-colors"
                 >
                   Cancel
                 </button>
               </div>
             </div>
          )}

          {loadingRounds ? (
            <div className="flex items-center gap-3 text-slate-400 py-8">
              <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
              Loading rounds...
            </div>
          ) : roundsError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {roundsError}
            </div>
          ) : rounds.length === 0 ? (
            <div className="glass rounded-2xl border border-white/5 p-12 text-center">
              <ClipboardList className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No rounds created for this paper yet.</p>
            </div>
          ) : (
            rounds.map(round => (
              <RoundCard
                key={round.id}
                round={round}
                onRefresh={handleRefresh}
                coordinatorId={user.id}
                paperHasOverleafLink={!!selectedPaper?.overleafLink?.trim()}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
}
