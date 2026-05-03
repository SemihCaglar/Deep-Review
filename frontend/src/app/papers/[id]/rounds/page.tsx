'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Star,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useUser } from '@/components/context/UserContext';
import { confirmCancel } from '@/lib/confirmAction';
import AIToolsModal from '@/components/papers/AIToolsModal';
import {
  addProposedReviewerRequest,
  ApiError,
  AuthorRound,
  createRoundRequest,
  editRoundDeadlineRequest,
  editSubmissionDeadlineRequest,
  getAuthorRoundsRequest,
  getPaperByIdRequest,
  getSuggestedReviewersRequest,
  Paper,
  ProposedReviewer,
  removeProposedReviewerRequest,
  submitRatingRequest,
  SuggestedReviewer,
} from '@/lib/api';

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

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusColor(status: string) {
  switch (status) {
    case 'Draft':
      return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    case 'Open':
      return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    case 'Completed':
      return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
    default:
      return 'text-slate-400 border-slate-500/30 bg-slate-500/10';
  }
}

function PreviousReviewMark() {
  return (
    <span
      title="This reviewer has previously completed a review for this paper."
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-300"
    >
      !
    </span>
  );
}

function StarRatingControl({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/10 hover:bg-white/[0.04]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1 text-sm text-slate-300">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-300">
          {value}/5
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(starValue => {
          const selected = starValue <= value;
          return (
            <button
              key={starValue}
              type="button"
              onClick={() => onChange(starValue)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white/5 hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              aria-label={`${label}: ${starValue} out of 5`}
              aria-pressed={selected}
            >
              <Star className={`h-5 w-5 transition-colors ${selected ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AuthorRoundOverview({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user } = useUser();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [rounds, setRounds] = useState<AuthorRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [roundsError, setRoundsError] = useState('');
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);

  const [showCreateRound, setShowCreateRound] = useState(false);
  const [newVenueCat, setNewVenueCat] = useState<'Conference' | 'Journal'>('Conference');
  const [newTargetVenue, setNewTargetVenue] = useState('');
  const [newTargetVenueUrl, setNewTargetVenueUrl] = useState('');
  const [newSubDeadline, setNewSubDeadline] = useState('');
  const [newRoundDeadline, setNewRoundDeadline] = useState('');
  const [creatingRound, setCreatingRound] = useState(false);
  const [createRoundError, setCreateRoundError] = useState('');

  const [proposedMap, setProposedMap] = useState<Record<string, ProposedReviewer[]>>({});
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, SuggestedReviewer[]>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<Record<string, boolean>>({});
  const [showSuggestPanel, setShowSuggestPanel] = useState<Record<string, boolean>>({});
  const [roundErrors, setRoundErrors] = useState<Record<string, string>>({});
  const [searchByRound, setSearchByRound] = useState<Record<string, string>>({});

  const [editingRoundDeadline, setEditingRoundDeadline] = useState<string | null>(null);
  const [roundDeadlineDraft, setRoundDeadlineDraft] = useState('');
  const [editingSubmissionDeadline, setEditingSubmissionDeadline] = useState<string | null>(null);
  const [submissionDeadlineDraft, setSubmissionDeadlineDraft] = useState('');

  const [aiToolsModalRound, setAiToolsModalRound] = useState<AuthorRound | null>(null);
  const [ratingAssignmentId, setRatingAssignmentId] = useState<string | null>(null);
  const [qualityScore, setQualityScore] = useState(5);
  const [quantityScore, setQuantityScore] = useState(5);
  const [timeScore, setTimeScore] = useState(5);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState('');

  const isAuthor = useMemo(
    () => !!paper?.authors?.some(author => author.id === user.id),
    [paper?.authors, user.id],
  );

  const refreshRounds = useCallback(async () => {
    const data = await getAuthorRoundsRequest(params.id);
    setRounds(data);
    setProposedMap(Object.fromEntries(data.map(round => [round.id, round.proposedReviewers ?? []])));
    if (!expandedRoundId && data.length > 0) {
      setExpandedRoundId(data[0].id);
    }
  }, [expandedRoundId, params.id]);

  useEffect(() => {
    if (!user.id) {
      router.replace('/login');
      return;
    }

    let active = true;
    setLoading(true);
    Promise.all([getPaperByIdRequest(params.id), getAuthorRoundsRequest(params.id)])
      .then(([paperData, roundsData]) => {
        if (!active) return;
        setPaper(paperData);
        setRounds(roundsData);
        setProposedMap(Object.fromEntries(roundsData.map(round => [round.id, round.proposedReviewers ?? []])));
        setExpandedRoundId(roundsData[0]?.id ?? null);
      })
      .catch(error => {
        if (!active) return;
        setRoundsError(error instanceof ApiError ? error.message : 'Failed to load round overview.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [params.id, router, user.id]);

  const latestRound = rounds[0] ?? null;
  const canCreateRound = !latestRound || latestRound.status === 'Completed';

  const handleCreateRound = async () => {
    if (!newTargetVenue.trim()) {
      setCreateRoundError('Venue name is required.');
      return;
    }
    if (!newTargetVenueUrl.trim()) {
      setCreateRoundError('Venue URL is required.');
      return;
    }
    if (!/^https?:\/\/.+/i.test(newTargetVenueUrl.trim())) {
      setCreateRoundError('Venue URL must start with http:// or https://.');
      return;
    }
    if (newVenueCat === 'Conference' && !newSubDeadline) {
      setCreateRoundError('Submission deadline is required for conference rounds.');
      return;
    }

    setCreatingRound(true);
    setCreateRoundError('');
    try {
      await createRoundRequest(
        params.id,
        newTargetVenue.trim(),
        newVenueCat,
        newVenueCat === 'Conference' ? dateInputToUtcIso(newSubDeadline) : undefined,
        newRoundDeadline ? dateInputToUtcIso(newRoundDeadline) : undefined,
        newTargetVenueUrl.trim(),
      );
      setShowCreateRound(false);
      setNewTargetVenue('');
      setNewTargetVenueUrl('');
      setNewSubDeadline('');
      setNewRoundDeadline('');
      await refreshRounds();
    } catch (error) {
      setCreateRoundError(error instanceof ApiError ? error.message : 'Failed to create round.');
    } finally {
      setCreatingRound(false);
    }
  };

  const openSuggestPanel = async (roundId: string) => {
    setShowSuggestPanel(prev => ({ ...prev, [roundId]: true }));
    setLoadingSuggestions(prev => ({ ...prev, [roundId]: true }));
    setRoundErrors(prev => ({ ...prev, [roundId]: '' }));
    try {
      const data = await getSuggestedReviewersRequest(roundId);
      const alreadyProposed = new Set((proposedMap[roundId] ?? []).map(reviewer => reviewer.id));
      setSuggestionsMap(prev => ({ ...prev, [roundId]: data.filter(s => !alreadyProposed.has(s.user.id)) }));
    } catch (error) {
      setRoundErrors(prev => ({
        ...prev,
        [roundId]: error instanceof ApiError ? error.message : 'Failed to load reviewer suggestions.',
      }));
    } finally {
      setLoadingSuggestions(prev => ({ ...prev, [roundId]: false }));
    }
  };

  const handleAddProposed = async (roundId: string, reviewerId: string) => {
    try {
      const updated = await addProposedReviewerRequest(roundId, reviewerId);
      setProposedMap(prev => ({ ...prev, [roundId]: updated }));
      setSuggestionsMap(prev => ({ ...prev, [roundId]: (prev[roundId] ?? []).filter(s => s.user.id !== reviewerId) }));
    } catch (error) {
      setRoundErrors(prev => ({
        ...prev,
        [roundId]: error instanceof ApiError ? error.message : 'Failed to add reviewer.',
      }));
    }
  };

  const handleRemoveProposed = async (roundId: string, userId: string) => {
    try {
      const updated = await removeProposedReviewerRequest(roundId, userId);
      setProposedMap(prev => ({ ...prev, [roundId]: updated }));
    } catch (error) {
      setRoundErrors(prev => ({
        ...prev,
        [roundId]: error instanceof ApiError ? error.message : 'Failed to remove reviewer.',
      }));
    }
  };

  const handleSaveRoundDeadline = async (roundId: string) => {
    try {
      await editRoundDeadlineRequest(roundId, dateInputToUtcIso(roundDeadlineDraft));
      setEditingRoundDeadline(null);
      await refreshRounds();
    } catch (error) {
      setRoundErrors(prev => ({
        ...prev,
        [roundId]: error instanceof ApiError ? error.message : 'Failed to save round deadline.',
      }));
    }
  };

  const handleSaveSubmissionDeadline = async (roundId: string) => {
    try {
      await editSubmissionDeadlineRequest(roundId, dateInputToUtcIso(submissionDeadlineDraft));
      setEditingSubmissionDeadline(null);
      await refreshRounds();
    } catch (error) {
      setRoundErrors(prev => ({
        ...prev,
        [roundId]: error instanceof ApiError ? error.message : 'Failed to save submission deadline.',
      }));
    }
  };

  const handleOpenRatingModal = (assignmentId: string) => {
    setRatingAssignmentId(assignmentId);
    setQualityScore(5);
    setQuantityScore(5);
    setTimeScore(5);
    setRatingError('');
  };

  const handleSubmitRating = async () => {
    if (!ratingAssignmentId) return;
    setSubmittingRating(true);
    setRatingError('');
    try {
      await submitRatingRequest(ratingAssignmentId, qualityScore, quantityScore, timeScore);
      setRounds(prev => prev.map(round => ({
        ...round,
        assignments: (round.assignments ?? []).map(assignment =>
          assignment.id === ratingAssignmentId ? { ...assignment, hasRating: true } : assignment,
        ),
      })));
      setRatingAssignmentId(null);
    } catch (error) {
      setRatingError(error instanceof ApiError ? error.message : 'Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-slate-400">Loading round overview...</p>
      </div>
    );
  }

  if (!paper) return notFound();

  if (!isAuthor && !user.isCoordinator) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <h1 className="mb-2 text-2xl font-bold text-red-400">Access Denied</h1>
        <p className="text-slate-400">Only paper authors and coordinators can view this round overview.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/papers/${paper.id}`} className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Paper Overview
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white">Round Overview</h1>
          <p className="mt-2 max-w-3xl text-slate-400">{paper.title}</p>
        </div>
        {canCreateRound && !showCreateRound && (
          <button
            onClick={() => setShowCreateRound(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            {rounds.length === 0 ? 'Create Initial Round' : 'Create Next Round'}
          </button>
        )}
      </div>

      <section className="glass rounded-2xl border border-white/5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-300">
            {rounds.length} round{rounds.length === 1 ? '' : 's'}
          </span>
          {paper.overleafLink ? (
            <a
              href={paper.overleafLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-400 transition-colors hover:text-emerald-300"
            >
              <ExternalLink className="h-4 w-4" />
              Open Overleaf
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-sm text-slate-500">
              <ExternalLink className="h-4 w-4" />
              No Overleaf link
            </span>
          )}
        </div>
      </section>

      {showCreateRound && (
        <section className="glass space-y-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6">
          <h2 className="text-base font-semibold text-blue-300">Setup Draft Round</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-slate-400">Venue Category</label>
              <select
                value={newVenueCat}
                onChange={event => setNewVenueCat(event.target.value as 'Conference' | 'Journal')}
                className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              >
                <option value="Conference">Conference</option>
                <option value="Journal">Journal</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-slate-400">Target Venue Name</label>
              <input
                value={newTargetVenue}
                onChange={event => setNewTargetVenue(event.target.value)}
                placeholder="e.g. NeurIPS 2026"
                className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs uppercase tracking-wider text-slate-400">Venue URL</label>
              <input
                type="url"
                value={newTargetVenueUrl}
                onChange={event => setNewTargetVenueUrl(event.target.value)}
                placeholder="https://venue.example/call-for-papers"
                className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
              <p className="flex items-center gap-1 text-[11px] font-medium text-amber-300/90">
                <AlertCircle className="h-3 w-3" />
                Double-check the venue URL before creating the round.
              </p>
            </div>
            {newVenueCat === 'Conference' && (
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-slate-400">Submission Deadline</label>
                <input
                  type="date"
                  value={newSubDeadline}
                  onChange={event => setNewSubDeadline(event.target.value)}
                  min={todayInputValue()}
                  className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-slate-400">Round Deadline</label>
              <input
                type="date"
                value={newRoundDeadline}
                onChange={event => setNewRoundDeadline(event.target.value)}
                min={todayInputValue()}
                max={newVenueCat === 'Conference' && newSubDeadline ? newSubDeadline : undefined}
                className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
          {createRoundError && <p className="text-xs text-red-400">{createRoundError}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleCreateRound}
              disabled={creatingRound || !newTargetVenue.trim() || !newTargetVenueUrl.trim() || (newVenueCat === 'Conference' && !newSubDeadline)}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {creatingRound ? 'Creating...' : 'Create Draft'}
            </button>
            <button
              onClick={async () => {
                if (await confirmCancel()) setShowCreateRound(false);
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {roundsError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {roundsError}
        </div>
      )}

      {rounds.length === 0 && !showCreateRound ? (
        <section className="glass rounded-2xl border border-white/5 p-12 text-center">
          <p className="text-sm text-slate-500">No rounds yet. Create the first draft round to propose reviewers.</p>
        </section>
      ) : (
        <section className="space-y-4">
          {rounds.map(round => {
            const proposed = proposedMap[round.id] ?? [];
            const suggestions = suggestionsMap[round.id] ?? [];
            const search = searchByRound[round.id] ?? '';
            const filteredSuggestions = suggestions.filter(s =>
              s.user.name.toLowerCase().includes(search.toLowerCase()) ||
              s.user.email.toLowerCase().includes(search.toLowerCase()),
            );
            const expanded = expandedRoundId === round.id;
            const aiReviews = round.aiReviewReports ?? round.artifacts?.aiReviewReports ?? [];
            const assignments = round.assignments ?? [];

            return (
              <article key={round.id} className="glass overflow-hidden rounded-2xl border border-white/5">
                <button
                  onClick={() => setExpandedRoundId(expanded ? null : round.id)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-600/20 text-sm font-bold text-blue-300">
                      {round.roundNumber}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{round.targetVenue || `Round ${round.roundNumber}`}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {round.venueCategory} | Round deadline: {formatDate(round.deadline)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusColor(round.status)}`}>
                      {round.status}
                    </span>
                    {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </div>
                </button>

                {expanded && (
                  <div className="space-y-5 border-t border-white/5 px-6 py-5">
                    <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wider text-slate-500">Venue Link</p>
                        {round.targetVenueUrl ? (
                          <a href={round.targetVenueUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-blue-400 hover:text-blue-300">
                            <ExternalLink className="h-4 w-4 shrink-0" />
                            <span className="truncate">{round.targetVenueUrl}</span>
                          </a>
                        ) : (
                          <p className="text-slate-500">Not set</p>
                        )}
                      </div>
                      {round.venueCategory === 'Conference' && (
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-wider text-slate-500">Submission Deadline</p>
                          {round.status !== 'Completed' && editingSubmissionDeadline === round.id ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="date"
                                value={submissionDeadlineDraft}
                                onChange={event => setSubmissionDeadlineDraft(event.target.value)}
                                min={maxDateInputValue(todayInputValue(), round.deadline ? toLocalDateInput(round.deadline) : undefined)}
                                className="rounded border border-white/10 bg-background px-2 py-1 text-xs text-white"
                              />
                              <button onClick={() => handleSaveSubmissionDeadline(round.id)} disabled={!submissionDeadlineDraft} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50">
                                Save
                              </button>
                              <button onClick={() => setEditingSubmissionDeadline(null)} className="text-xs text-slate-400 hover:text-white">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-white">{formatDate(round.submissionDeadline)}</p>
                              {round.status !== 'Completed' && (
                                <button
                                  onClick={() => {
                                    setEditingSubmissionDeadline(round.id);
                                    setSubmissionDeadlineDraft(round.submissionDeadline ? toLocalDateInput(round.submissionDeadline) : '');
                                  }}
                                  className="rounded border border-blue-500/30 px-2 py-0.5 text-xs text-blue-400 hover:text-blue-300"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wider text-slate-500">Round Deadline</p>
                        {round.status !== 'Completed' && editingRoundDeadline === round.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="date"
                              value={roundDeadlineDraft}
                              onChange={event => setRoundDeadlineDraft(event.target.value)}
                              min={todayInputValue()}
                              max={round.submissionDeadline ? toLocalDateInput(round.submissionDeadline) : undefined}
                              className="rounded border border-white/10 bg-background px-2 py-1 text-xs text-white"
                            />
                            <button onClick={() => handleSaveRoundDeadline(round.id)} disabled={!roundDeadlineDraft} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50">
                              Save
                            </button>
                            <button onClick={() => setEditingRoundDeadline(null)} className="text-xs text-slate-400 hover:text-white">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-white">{formatDate(round.deadline)}</p>
                            {round.status !== 'Completed' && (
                              <button
                                onClick={() => {
                                  setEditingRoundDeadline(round.id);
                                  setRoundDeadlineDraft(round.deadline ? toLocalDateInput(round.deadline) : '');
                                }}
                                className="rounded border border-blue-500/30 px-2 py-0.5 text-xs text-blue-400 hover:text-blue-300"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-indigo-300">AI Review Analyses</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {aiReviews.length > 0
                              ? `${aiReviews.length} saved analysis${aiReviews.length === 1 ? '' : 'es'} for this round.`
                              : 'No saved AI analysis for this round yet.'}
                          </p>
                        </div>
                        <button
                          onClick={() => setAiToolsModalRound(round)}
                          disabled={round.status === 'Draft'}
                          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Cpu className="h-4 w-4" />
                          AI Tools
                        </button>
                      </div>
                      {aiReviews.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {aiReviews.map(review => (
                            <div key={review.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm text-white">{review.venue || round.targetVenue || `Round ${round.roundNumber}`}</p>
                                <p className="text-xs text-slate-500">{formatDate(review.createdAt)}</p>
                              </div>
                              {review.annotatedPdfUrl && (
                                <a href={review.annotatedPdfUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                                  Annotated PDF
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {round.status === 'Draft' && (
                      <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-amber-300">Proposed Reviewers ({proposed.length})</p>
                            <p className="mt-1 text-xs text-slate-400">The coordinator reviews these proposals before the round starts.</p>
                          </div>
                          <button
                            onClick={() => showSuggestPanel[round.id] ? setShowSuggestPanel(prev => ({ ...prev, [round.id]: false })) : openSuggestPanel(round.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 px-3 py-2 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-500/10"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Add Reviewer
                          </button>
                        </div>

                        {proposed.length === 0 ? (
                          <p className="text-xs italic text-slate-500">No reviewers proposed yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {proposed.map(reviewer => (
                              <div key={reviewer.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-300">
                                    {reviewer.name.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="truncate text-sm text-white">{reviewer.name}</p>
                                      {reviewer.hasPreviouslyCompletedReview && <PreviousReviewMark />}
                                    </div>
                                    <p className="truncate text-xs text-slate-500">{reviewer.email}</p>
                                  </div>
                                </div>
                                <button onClick={() => handleRemoveProposed(round.id, reviewer.id)} className="text-slate-500 transition-colors hover:text-red-400">
                                  <XCircle className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {showSuggestPanel[round.id] && (
                          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                              <input
                                value={search}
                                onChange={event => setSearchByRound(prev => ({ ...prev, [round.id]: event.target.value }))}
                                placeholder="Search reviewers..."
                                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                              />
                            </div>
                            {loadingSuggestions[round.id] ? (
                              <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading reviewers...
                              </div>
                            ) : filteredSuggestions.length === 0 ? (
                              <p className="py-2 text-sm text-slate-500">No eligible reviewers found.</p>
                            ) : (
                              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                {filteredSuggestions.map(suggestion => (
                                  <div key={suggestion.user.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="truncate text-sm text-white">{suggestion.user.name}</p>
                                        {suggestion.hasPreviouslyCompletedReview && <PreviousReviewMark />}
                                      </div>
                                      <p className="truncate text-xs text-slate-500">{suggestion.user.email}</p>
                                    </div>
                                    <button
                                      onClick={() => handleAddProposed(round.id, suggestion.user.id)}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-600/20 px-2 py-1 text-xs text-blue-200 transition-colors hover:bg-blue-600/40"
                                    >
                                      <Plus className="h-3 w-3" />
                                      Add
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {round.status !== 'Draft' && (
                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-200">Assigned Reviewers ({assignments.length})</p>
                            <p className="mt-1 text-xs text-slate-400">Submitted reviews show their summary and can be rated once.</p>
                          </div>
                        </div>

                        {assignments.length === 0 ? (
                          <p className="text-sm text-slate-500">No reviewers assigned to this round yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {assignments.map(assignment => {
                              const completed = assignment.status === 'Completed';
                              return (
                                <div key={assignment.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-300">
                                        {assignment.reviewer.name.charAt(0)}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <p className="truncate text-sm font-medium text-white">{assignment.reviewer.name}</p>
                                          {assignment.hasPreviouslyCompletedReview && <PreviousReviewMark />}
                                        </div>
                                        <p className="truncate text-xs text-slate-500">{assignment.reviewer.email}</p>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusColor(assignment.status)}`}>
                                        {assignment.status}
                                      </span>
                                      {completed && assignment.hasRating ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Rated
                                        </span>
                                      ) : completed ? (
                                        <button
                                          onClick={() => handleOpenRatingModal(assignment.id)}
                                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500"
                                        >
                                          <Star className="h-3.5 w-3.5" />
                                          Rate Reviewer
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>

                                  {completed && (
                                    <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-purple-300">Review Summary</p>
                                      {assignment.reviewSummary?.text ? (
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{assignment.reviewSummary.text}</p>
                                      ) : (
                                        <p className="text-sm italic text-slate-500">No summary submitted.</p>
                                      )}
                                      {assignment.reviewSummary?.submittedAt && (
                                        <p className="mt-2 text-xs text-slate-500">Submitted {formatDate(assignment.reviewSummary.submittedAt)}</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {round.status === 'Open' && (
                      <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                        Round is open. Reviewers have been assigned and invited by the coordinator.
                      </p>
                    )}

                    {round.status === 'Completed' && (
                      <p className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-3 text-sm text-purple-300">
                        Round is completed. Saved AI analyses remain available above.
                      </p>
                    )}

                    {roundErrors[round.id] && <p className="text-xs text-red-400">{roundErrors[round.id]}</p>}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <AIToolsModal
        isOpen={!!aiToolsModalRound}
        onClose={() => setAiToolsModalRound(null)}
        round={aiToolsModalRound}
        paperId={paper.id}
        onRefresh={() => {
          refreshRounds().catch(() => {});
        }}
      />

      {ratingAssignmentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass relative w-full max-w-lg rounded-2xl border border-white/10 p-6 shadow-2xl">
            <button
              onClick={() => setRatingAssignmentId(null)}
              className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-white"
              disabled={submittingRating}
            >
              <XCircle className="h-5 w-5" />
            </button>
            <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-white">
              <Star className="h-5 w-5 text-amber-400" />
              Rate Reviewer
            </h2>
            <p className="mb-5 text-sm text-slate-400">
              Provide feedback on this review. This information is only visible to the lab coordinator.
            </p>

            {ratingError && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {ratingError}
              </div>
            )}

            <div className="space-y-3">
              <StarRatingControl
                label="Quality"
                description="How thorough and helpful was the review?"
                value={qualityScore}
                onChange={setQualityScore}
              />
              <StarRatingControl
                label="Quantity"
                description="Was there a sufficient amount of feedback?"
                value={quantityScore}
                onChange={setQuantityScore}
              />
              <StarRatingControl
                label="Timeliness"
                description="Did the reviewer respect the deadlines?"
                value={timeScore}
                onChange={setTimeScore}
              />
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setRatingAssignmentId(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5"
                disabled={submittingRating}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRating}
                disabled={submittingRating}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {submittingRating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {submittingRating ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
