'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/components/context/UserContext';
import {
  CoordinatedPaper,
  RoundWithAssignments,
  RoundAssignment,
  SuggestedReviewer,
  ApiError,
  getMyCoordinatedPapersRequest,
  getPaperRoundsRequest,
  getSuggestedReviewersRequest,
  assignReviewersRequest,
  sendInvitationsRequest,
  cancelAssignmentRequest,
  updateAssignmentDeadlineRequest,
  processDeclineRequestApi,
  processExtensionRequestApi,
} from '@/lib/api';
import { ClipboardList, ChevronDown, ChevronUp, Mail, Ban, Calendar, CheckCircle, XCircle, AlertCircle, Clock, UserPlus, Loader2 } from 'lucide-react';

// ── Status badge ─────────────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case 'Invited':    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'Accepted':   return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
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
      {status}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Assignment row ────────────────────────────────────────────────────────────

function AssignmentRow({
  assignment,
  roundDeadline,
  onRefresh,
}: {
  assignment: RoundAssignment;
  roundDeadline: string;
  onRefresh: () => void;
}) {
  const [showDeadlineInput, setShowDeadlineInput] = useState(false);
  const [newDeadline, setNewDeadline] = useState('');
  const [showExtApprove, setShowExtApprove] = useState(false);
  const [approvedDeadline, setApprovedDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const handleCancel = () => act(() => cancelAssignmentRequest(assignment.id));

  const handleUpdateDeadline = () =>
    act(async () => {
      await updateAssignmentDeadlineRequest(assignment.id, new Date(newDeadline).toISOString());
      setShowDeadlineInput(false);
    });

  const handleProcessDecline = (decision: 'approve' | 'reject') =>
    act(() => processDeclineRequestApi(assignment.pendingDeclineRequest!.id, decision));

  const handleProcessExtension = (decision: 'approve' | 'reject') =>
    act(async () => {
      await processExtensionRequestApi(
        assignment.pendingExtensionRequest!.id,
        decision,
        decision === 'approve' ? new Date(approvedDeadline).toISOString() : undefined,
      );
      setShowExtApprove(false);
    });

  const isCancelable = ['Invited', 'Accepted'].includes(assignment.status);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-5 rounded-xl bg-white/[0.02] border border-white/5">
        {/* Reviewer info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center font-semibold text-sm shrink-0">
            {assignment.reviewer.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{assignment.reviewer.name}</p>
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
              Invited
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
          <button
            onClick={() => {
              if (!showDeadlineInput) {
                setNewDeadline(assignment.deadline ? new Date(assignment.deadline).toISOString().split('T')[0] : '');
              }
              setShowDeadlineInput(v => !v);
              setError('');
            }}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <Calendar className="w-3.5 h-3.5" /> Deadline
          </button>
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
            max={new Date(roundDeadline).toISOString().split('T')[0]}
            className="bg-background border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <button
            onClick={handleUpdateDeadline}
            disabled={!newDeadline || busy}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            Save
          </button>
          <button onClick={() => setShowDeadlineInput(false)} className="text-xs text-slate-500 hover:text-slate-300">
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
                <p className="text-xs text-slate-400">"{assignment.pendingDeclineRequest.reason}"</p>
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
                <p className="text-xs text-slate-500 mt-0.5">"{assignment.pendingExtensionRequest.reason}"</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {!showExtApprove ? (
                <button
                  onClick={() => setShowExtApprove(true)}
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
                    max={new Date(roundDeadline).toISOString().split('T')[0]}
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

      {error && (
        <p className="mx-5 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

// ── Round card ────────────────────────────────────────────────────────────────

function RoundCard({ round, onRefresh }: { round: RoundWithAssignments; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(true);

  // Add Reviewer panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedReviewer[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState('');
  const [assignError, setAssignError] = useState('');

  const openAddPanel = async () => {
    setShowAddPanel(true);
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

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setAssigning(true);
    setAssignMsg('');
    setAssignError('');
    try {
      const result = await assignReviewersRequest(round.id, Array.from(selectedIds));
      await sendInvitationsRequest(round.id);
      setAssignMsg(`${result.length} reviewer(s) assigned and invited.`);
      setSelectedIds(new Set());
      setShowAddPanel(false);
      onRefresh();
    } catch (e) {
      setAssignError(e instanceof ApiError ? e.message : 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const pendingCount = round.assignments.filter(
    a => a.pendingDeclineRequest || a.pendingExtensionRequest,
  ).length;


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
            <p className="text-white font-semibold">Round {round.roundNumber}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Deadline: {formatDate(round.deadline)} · {round.assignments.length} reviewer(s)
              {pendingCount > 0 && (
                <span className="ml-2 text-amber-400">· {pendingCount} pending request(s)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${round.status === 'Open' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
            {round.status}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-6 py-4 space-y-4">
          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => showAddPanel ? setShowAddPanel(false) : openAddPanel()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add Reviewer
            </button>
            {assignMsg && <p className="text-xs text-emerald-400">{assignMsg}</p>}
          </div>

          {/* Add reviewer panel */}
          {showAddPanel && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select reviewers to assign</p>
              {loadingSuggestions ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading suggestions...
                </div>
              ) : suggestError ? (
                <p className="text-xs text-red-400">{suggestError}</p>
              ) : suggestions.length === 0 ? (
                <p className="text-xs text-slate-500">No eligible reviewers found for this round.</p>
              ) : (
                <div className="space-y-2">
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
                        type="checkbox"
                        checked={selectedIds.has(s.user.id)}
                        onChange={() => toggleSelect(s.user.id)}
                        className="accent-blue-500 w-4 h-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{s.user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{s.user.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {s.reasons.map((r, i) => (
                          <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${r.startsWith('Warning') ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'}`}>
                            {r}
                          </span>
                        ))}
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
                  Assign {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </button>
                <button onClick={() => setShowAddPanel(false)} className="text-xs text-slate-500 hover:text-slate-300">
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
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RoundsPage() {
  const { user } = useUser();
  const [papers, setPapers] = useState<CoordinatedPaper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundWithAssignments[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(true);
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [papersError, setPapersError] = useState('');
  const [roundsError, setRoundsError] = useState('');

  useEffect(() => {
    if (!user.id) return;
    getMyCoordinatedPapersRequest()
      .then(setPapers)
      .catch(e => setPapersError(e instanceof ApiError ? e.message : 'Failed to load papers'))
      .finally(() => setLoadingPapers(false));
  }, [user.id]);

  const loadRounds = useCallback((paperId: string) => {
    setLoadingRounds(true);
    setRoundsError('');
    getPaperRoundsRequest(paperId)
      .then(setRounds)
      .catch(e => setRoundsError(e instanceof ApiError ? e.message : 'Failed to load rounds'))
      .finally(() => setLoadingRounds(false));
  }, []);

  const handleSelectPaper = (paperId: string) => {
    setSelectedPaperId(paperId);
    setRounds([]);
    loadRounds(paperId);
  };

  const handleRefresh = () => {
    if (selectedPaperId) loadRounds(selectedPaperId);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {papers.map(paper => (
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
                  <span className="text-xs text-slate-500 truncate">{paper.targetVenue}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs border ${statusColor(paper.status)}`}>
                    {paper.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Rounds */}
      {selectedPaper && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Rounds for <span className="text-blue-400">{selectedPaper.title}</span>
            </h2>
          </div>

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
              <RoundCard key={round.id} round={round} onRefresh={handleRefresh} />
            ))
          )}
        </section>
      )}
    </div>
  );
}
