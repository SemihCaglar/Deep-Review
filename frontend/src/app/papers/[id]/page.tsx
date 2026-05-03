'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import { MOCK_ROUNDS, MOCK_ASSIGNMENTS } from '@/lib/mockData';
import { confirmCancel } from '@/lib/confirmAction';
import { ArrowLeft, UserPlus, CheckCircle2, Clock, XCircle, Play, Archive, Edit, ExternalLink, Loader2, ArrowUp, ArrowDown, Plus, ChevronDown, ChevronUp, Star, Search, FlaskConical, X, Cpu, Download, AlertCircle } from 'lucide-react';
import {
  getPaperByIdRequest, updatePaperAbstractRequest, updatePaperTopicsRequest,
  getLabTopicsRequest, getPaperHistoryRequest, TopicOption, Paper, PaperHistory,
  getLabMembersRequest, ApiError, LabMember, Lab,
  AuthorRound, getAuthorRoundsRequest, createRoundRequest, editRoundDeadlineRequest, editSubmissionDeadlineRequest,
  getSuggestedReviewersRequest, SuggestedReviewer, ProposedReviewer,
  getProposedReviewersRequest, addProposedReviewerRequest, removeProposedReviewerRequest,
  updateOverleafLinkRequest, updatePaperStatusRequest,
  submitRatingRequest,
  getLabsRequest,
  getPaperInvitationsRequest, sendCollaborationInvitationsRequest, cancelCollaborationInvitationRequest,
  LabCollaborationInvitation,
  startAIReviewRequest,
  sendPaperRemindersRequest,
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
                    const isSelected = starValue <= value;
                    return (
                        <button
                            key={starValue}
                            type="button"
                            onClick={() => onChange(starValue)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white/5 hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            aria-label={`${label}: ${starValue} out of 5`}
                            aria-pressed={isSelected}
                        >
                            <Star
                                className={`h-5 w-5 transition-colors ${
                                    isSelected ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                                }`}
                            />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

const AI_PHASES = [
    { at: 0, msg: 'Uploading PDF to agent…' },
    { at: 4, msg: 'Agent is reading the paper…' },
    { at: 12, msg: 'Analyzing content and generating feedback…' },
    { at: 22, msg: 'Annotating PDF…' },
    { at: 32, msg: 'Downloading annotated PDF…' },
    { at: 42, msg: 'Almost done…' },
];

export default function PaperDetails({ params }: { params: { id: string } }) {
    const { user } = useUser();
    const router = useRouter();
    const [paper, setPaper] = useState<Paper | null>(null);
    const [loading, setLoading] = useState(true);
    const [availableTopics, setAvailableTopics] = useState<TopicOption[]>([]);
    
    const [isAccepting, setIsAccepting] = useState(false);
    const [acceptError, setAcceptError] = useState('');
    const [declineReason, setDeclineReason] = useState('');
    const [showDeclineForm, setShowDeclineForm] = useState(false);
    const [showExtensionForm, setShowExtensionForm] = useState(false);
    const [extensionReason, setExtensionReason] = useState('');
    const [hasRequestedExtension, setHasRequestedExtension] = useState<Record<string, boolean>>({});
    const [extensionStatus, setExtensionStatus] = useState<Record<string, 'Approved' | 'Rejected'>>({});

    // Mock state overrides for interactivity
    const [localStatus, setLocalStatus] = useState<string | null>(null);
    const [localAssignmentStatus, setLocalAssignmentStatus] = useState<string | null>(null);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [isEditingAbstract, setIsEditingAbstract] = useState(false);
    const [isEditingTopics, setIsEditingTopics] = useState(false);
    const [isEditingLinks, setIsEditingLinks] = useState(false);
    const [isSendingReminder, setIsSendingReminder] = useState(false);
    const [reminderSent, setReminderSent] = useState(false);
    const [reminderError, setReminderError] = useState('');
    const [isEditingAuthors, setIsEditingAuthors] = useState(false);
    const [localAuthors, setLocalAuthors] = useState<string[]>([]);
    const [availableUsers, setAvailableUsers] = useState<LabMember[]>([]);

    const [localAbstract, setLocalAbstract] = useState('');
    const [abstractError, setAbstractError] = useState('');
    const [topicsError, setTopicsError] = useState('');
    const [authorsError, setAuthorsError] = useState('');
    const [localTopics, setLocalTopics] = useState<string[]>([]); // These will be IDs
    const [localOverleafLink, setLocalOverleafLink] = useState('');

    const [authorSearch, setAuthorSearch] = useState('');
    const [topicSearch, setTopicSearch] = useState('');

    const [linksError, setLinksError] = useState('');
    const [savingLinks, setSavingLinks] = useState(false);
    const [paperHistory, setPaperHistory] = useState<PaperHistory | null>(null);
    const [historyError, setHistoryError] = useState('');
    const [historyExpanded, setHistoryExpanded] = useState(false);
    const [expandedHistoryRounds, setExpandedHistoryRounds] = useState<Set<string>>(new Set());
    const [expandedHistoryAssignments, setExpandedHistoryAssignments] = useState<Set<string>>(new Set());
    const [expandedHistoryCategories, setExpandedHistoryCategories] = useState<Set<string>>(new Set());

    // Author round proposal state
    const [authorRounds, setAuthorRounds] = useState<AuthorRound[]>([]);
    const [loadingRounds, setLoadingRounds] = useState(false);
    const [showCreateRound, setShowCreateRound] = useState(false);
    const [newVenueCat, setNewVenueCat] = useState('Conference');
    const [newTargetVenue, setNewTargetVenue] = useState('');
    const [newTargetVenueUrl, setNewTargetVenueUrl] = useState('');
    const [newSubDeadline, setNewSubDeadline] = useState('');
    const [newRoundDeadline, setNewRoundDeadline] = useState('');
    const [creatingRound, setCreatingRound] = useState(false);
    const [createRoundError, setCreateRoundError] = useState('');
    // Per-round proposal panel state (keyed by round id)
    const [expandedRound, setExpandedRound] = useState<string | null>(null);
    const [proposedMap, setProposedMap] = useState<Record<string, ProposedReviewer[]>>({});
    const [suggestionsMap, setSuggestionsMap] = useState<Record<string, SuggestedReviewer[]>>({});
    const [loadingSuggestions, setLoadingSuggestions] = useState<Record<string, boolean>>({});
    const [showSuggestPanel, setShowSuggestPanel] = useState<Record<string, boolean>>({});
    const [roundErrors, setRoundErrors] = useState<Record<string, string>>({});
    const [editingRoundDeadline, setEditingRoundDeadline] = useState<string | null>(null);
    const [roundDeadlineDraft, setRoundDeadlineDraft] = useState('');
    const [editingSubmissionDeadline, setEditingSubmissionDeadline] = useState<string | null>(null);
    const [submissionDeadlineDraft, setSubmissionDeadlineDraft] = useState('');
    const aiFileRef = useRef<HTMLInputElement>(null);
    const pendingAiRoundId = useRef<string | null>(null);
    const [runningAiRoundId, setRunningAiRoundId] = useState<string | null>(null);
    const [aiStatusByRound, setAiStatusByRound] = useState<Record<string, string>>({});
    const [aiResultsByRound, setAiResultsByRound] = useState<Record<string, any>>({});

    // Collaboration state
    const [collabInvitations, setCollabInvitations] = useState<LabCollaborationInvitation[]>([]);
    const [allLabs, setAllLabs] = useState<Lab[]>([]);
    const [showInviteLabPanel, setShowInviteLabPanel] = useState(false);
    const [selectedInviteLabIds, setSelectedInviteLabIds] = useState<string[]>([]);
    const [labSearchQuery, setLabSearchQuery] = useState('');
    const [sendingInvites, setSendingInvites] = useState(false);
    const [inviteError, setInviteError] = useState('');
    const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
    const [cancelError, setCancelError] = useState('');

    // Rating Modal state
    const [ratingModalOpen, setRatingModalOpen] = useState(false);
    const [ratingAssignmentId, setRatingAssignmentId] = useState<string | null>(null);
    const [qualityScore, setQualityScore] = useState(5);
    const [quantityScore, setQuantityScore] = useState(5);
    const [timeScore, setTimeScore] = useState(5);
    const [submittingRating, setSubmittingRating] = useState(false);
    const [ratingError, setRatingError] = useState('');

    useEffect(() => {
        if (!user.id) {
            setPaper(null);
            setLoading(false);
            router.replace('/login');
            return;
        }

        let isActive = true;

        const fetchData = async () => {
            try {
                const paperData = await getPaperByIdRequest(params.id);
                const topicLabId = paperData.labs?.[0]?.id ?? user.labs?.[0]?.id;
                const topicsData = topicLabId ? await getLabTopicsRequest(topicLabId) : [];
                if (!isActive) return;
                setPaper(paperData);
                setLocalAbstract(paperData.abstractText || '');
                setLocalTopics(paperData.topics?.map((t: any) => t.id) || []);
                setLocalAuthors(paperData.authors?.map((a: any) => a.id) || []);
                setLocalOverleafLink(paperData.overleafLink || '');
                setAvailableTopics(topicsData);

                // Fetch lab members for author editing
                const membersRes = await getLabMembersRequest();
                if (!isActive) return;
                setAvailableUsers(membersRes.users);

                try {
                    const historyData = await getPaperHistoryRequest(params.id);
                    if (!isActive) return;
                    setPaperHistory(historyData);
                    setHistoryError('');
                } catch (historyErr) {
                    console.error('Failed to fetch paper history', historyErr);
                    setPaperHistory(null);
                    if (historyErr instanceof ApiError) {
                        if (historyErr.status === 403) {
                            setHistoryError('You do not have permission to view the history of this paper.');
                        } else if (historyErr.status === 404) {
                            setHistoryError('Paper history not found.');
                        } else {
                            setHistoryError(historyErr.message || 'Failed to load paper history.');
                        }
                    } else {
                        setHistoryError('An unexpected error occurred while fetching paper history.');
                    }
                }
            } catch (err) {
                console.error('Failed to fetch paper details', err);
            } finally {
                if (isActive) setLoading(false);
            }
        };
        fetchData();
        return () => {
            isActive = false;
        };
    }, [params.id, router, user.id, user.labs]);

    // Load collaboration invitations and available labs (coordinator only)
    useEffect(() => {
        if (!paper || !user.isCoordinator) return;
        const paperLabIds = new Set((paper.labs ?? []).map(l => l.id));
        const userLabIds = new Set((user.labs ?? []).map(l => l.id));
        Promise.all([
            getPaperInvitationsRequest(params.id).catch(() => [] as LabCollaborationInvitation[]),
            getLabsRequest().catch(() => [] as Lab[]),
        ]).then(([invitations, labs]) => {
            setCollabInvitations(invitations);
            const pendingLabIds = new Set(
                invitations.filter(inv => inv.status === 'Pending').map(inv => inv.invitedLab.id)
            );
            setAllLabs(labs.filter(l =>
                !paperLabIds.has(l.id) && !userLabIds.has(l.id) && !pendingLabIds.has(l.id)
            ));
        });
    }, [paper, user.isCoordinator, params.id, user.labs]);

    // Load author rounds when paper is available and user is author/coordinator
    useEffect(() => {
        if (!paper || !user.id) return;
        const userIsAuthor = paper.authors?.some(a => a.id === user.id);
        if (!userIsAuthor && !user.isCoordinator) return;
        setLoadingRounds(true);
        getAuthorRoundsRequest(params.id)
            .then(rounds => {
                setAuthorRounds(rounds);
                // Pre-populate proposed lists
                const map: Record<string, { id: string; name: string; email: string }[]> = {};
                rounds.forEach(r => { map[r.id] = r.proposedReviewers; });
                setProposedMap(map);
            })
            .catch(() => { /* silently ignore */ })
            .finally(() => setLoadingRounds(false));
    }, [paper, user.id, user.isCoordinator, params.id]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-slate-400 animate-pulse">Loading paper details...</p>
            </div>
        );
    }

    if (!paper) {
        return notFound();
    }

    const isAuthor = paper.authors?.some(a => a.id === user.id);
    const canViewHistory = user.isCoordinator || isAuthor;
    const canEditAbstract = user.isCoordinator || isAuthor;

    const currentStatus = localStatus || paper.status;

    // Get assignments for this paper
    const activeRound = MOCK_ROUNDS.find(r => r.paperId === paper.id && r.status === 'Open');
    const assignments = activeRound ? MOCK_ASSIGNMENTS.filter(a => a.roundId === activeRound.id) : [];
    const myAssignment = activeRound ? assignments.find(a => a.reviewerId === user.id) : null;

    // Determine back link based on role and assignment status
    let backHref = '/papers';
    if (!user.isCoordinator) {
        if (myAssignment) {
            backHref = '/my-reviews';
        } else if (isAuthor) {
            backHref = '/papers?filter=authored';
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Draft': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
            case 'In Review': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'Completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'Accepted': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            default: return 'bg-white/10 text-slate-300 border-white/20';
        }
    };

    const handleAccept = async () => {
        if (!await confirmCancel('Are you sure you want to accept this paper? This action cannot be undone.')) return;
        setIsAccepting(true);
        setAcceptError('');
        try {
            const updatedPaper = await updatePaperStatusRequest(paper.id, 'Accepted');
            setPaper(updatedPaper);
            setLocalStatus(updatedPaper.status);
        } catch (err) {
            setAcceptError(err instanceof ApiError ? err.message : 'Failed to accept paper.');
        } finally {
            setIsAccepting(false);
        }
    };

    const effectivePaperStatus = currentStatus;
    const canEditAuthors = (user.isCoordinator || isAuthor) && effectivePaperStatus !== 'Accepted';
    const canEditLinks = (user.isCoordinator || isAuthor) && effectivePaperStatus !== 'Accepted';
    const canChangeAcceptState = user.isCoordinator || isAuthor;
    const authorDirectory = [
        ...(paper.authors ?? []),
        ...(paper.coordinators ?? []),
        ...(availableUsers ?? []),
    ].reduce<Record<string, { id: string; name: string; email: string; role?: string }>>((byId, author) => {
        byId[author.id] = { ...byId[author.id], ...author };
        return byId;
    }, {});
    const coordinatorAuthorIds = new Set((paper.coordinators ?? []).map(coordinator => coordinator.id));
    const removableAuthorIds = new Set(
        availableUsers
            .filter(author => author.role !== 'Coordinator' && author.role !== 'Admin')
            .map(author => author.id)
    );
    const orderedPaperAuthorIds = (paper.authors ?? []).map(author => author.id);
    const addableAuthorOptions = availableUsers.filter(candidate => {
        if (candidate.role === 'Coordinator' || candidate.role === 'Admin') return false;
        return !localAuthors.includes(candidate.id);
    });

    const handleSubmitReview = () => {
        setIsSubmittingReview(true);
        setTimeout(() => {
            setLocalAssignmentStatus('Submitted');
            setIsSubmittingReview(false);
        }, 800);
    };

    const handleSaveAuthors = async () => {
        setAuthorsError('');
        try {
            const { updatePaperAuthorsRequest } = await import('@/lib/api');
            const updatedPaper = await updatePaperAuthorsRequest(paper.id, localAuthors);
            setPaper(updatedPaper);
            setIsEditingAuthors(false);
        } catch (err) {
            setAuthorsError(err instanceof ApiError ? err.message : 'Failed to update authors. Please try again.');
        }
    };

    const handleSaveLinks = async () => {
        setLinksError('');
        try {
            const trimmedOverleafLink = localOverleafLink.trim();
            if (!trimmedOverleafLink) {
                setLinksError('Overleaf link is mandatory');
                return;
            }
            if (!/^https?:\/\/([a-z0-9-]+\.)*overleaf\.com\//i.test(trimmedOverleafLink)) {
                setLinksError('Overleaf link must be a valid Overleaf URL (e.g. https://www.overleaf.com/...)');
                return;
            }

            setSavingLinks(true);
            try {
                await updateOverleafLinkRequest(paper.id, trimmedOverleafLink);
            } catch (err) {
                setLinksError(err instanceof ApiError ? err.message : 'Failed to update Overleaf link. Please try again.');
                return;
            }

            const persistedPaper = await getPaperByIdRequest(paper.id);
            const nextOverleafLink = persistedPaper.overleafLink ?? null;
            setPaper(persistedPaper);
            setPaperHistory(prev => prev ? {
                ...prev,
                overleafLink: nextOverleafLink,
            } : prev);
            setLocalOverleafLink(nextOverleafLink || '');
            setIsEditingLinks(false);
        } catch (err) {
            setLinksError(err instanceof ApiError ? err.message : 'Failed to update links. Please try again.');
        } finally {
            setSavingLinks(false);
        }
    };

    const toggleAuthor = (id: string) => {
        if (localAuthors.includes(id)) {
            setLocalAuthors(localAuthors.filter(a => a !== id));
        } else {
            setLocalAuthors([...localAuthors, id]);
        }
    };

    const moveAuthor = (index: number, direction: 'up' | 'down') => {
        const newAuthors = [...localAuthors];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newAuthors.length) return;
        
        [newAuthors[index], newAuthors[targetIndex]] = [newAuthors[targetIndex], newAuthors[index]];
        setLocalAuthors(newAuthors);
    };

    const handleSendReminder = async () => {
        setIsSendingReminder(true);
        setReminderError('');
        try {
            await sendPaperRemindersRequest(paper.id);
            setReminderSent(true);
            setTimeout(() => setReminderSent(false), 3000);
        } catch (err) {
            setReminderError(err instanceof ApiError ? err.message : 'Failed to send reminders. Please try again.');
        } finally {
            setIsSendingReminder(false);
        }
    };

    const handleSaveAbstract = async () => {
        setAbstractError('');
        try {
            const updatedPaper = await updatePaperAbstractRequest(paper.id, localAbstract);
            setPaper(updatedPaper);
            setIsEditingAbstract(false);
        } catch (err) {
            setAbstractError(err instanceof ApiError ? err.message : 'Failed to update abstract. Please try again.');
        }
    };

    const handleSaveTopics = async () => {
        setTopicsError('');
        try {
            const updatedPaper = await updatePaperTopicsRequest(paper.id, localTopics);
            setPaper({ ...paper, topics: updatedPaper.topics });
            setIsEditingTopics(false);
        } catch (err) {
            setTopicsError(err instanceof ApiError ? err.message : 'Failed to update topics. Please try again.');
        }
    };

    const toggleTopic = (id: string) => {
        if (localTopics.includes(id)) {
            setLocalTopics(localTopics.filter(t => t !== id));
        } else {
            setLocalTopics([...localTopics, id]);
        }
    };

    // Author round handlers
    const refreshRounds = async () => {
        try {
            const rounds = await getAuthorRoundsRequest(params.id);
            setAuthorRounds(rounds);
            const map: Record<string, { id: string; name: string; email: string }[]> = {};
            rounds.forEach(r => { map[r.id] = r.proposedReviewers; });
            setProposedMap(map);
        } catch { /* ignore */ }
    };

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
            setCreateRoundError('Submission deadline is required for Conference rounds.');
            return;
        }
        setCreatingRound(true);
        setCreateRoundError('');
        try {
            await createRoundRequest(
                params.id, newTargetVenue.trim(), newVenueCat,
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
        } catch (e) {
            setCreateRoundError(e instanceof ApiError ? e.message : 'Failed to create round');
        } finally {
            setCreatingRound(false);
        }
    };

    const handleSaveRoundDeadline = async (roundId: string) => {
        try {
            await editRoundDeadlineRequest(roundId, dateInputToUtcIso(roundDeadlineDraft));
            setEditingRoundDeadline(null);
            await refreshRounds();
        } catch (e) {
            setRoundErrors(prev => ({ ...prev, [roundId]: e instanceof ApiError ? e.message : 'Failed to save deadline' }));
        }
    };

    const handleSaveSubmissionDeadline = async (roundId: string) => {
        try {
            await editSubmissionDeadlineRequest(roundId, dateInputToUtcIso(submissionDeadlineDraft));
            setEditingSubmissionDeadline(null);
            await refreshRounds();
        } catch (e) {
            setRoundErrors(prev => ({ ...prev, [roundId]: e instanceof ApiError ? e.message : 'Failed to save submission deadline' }));
        }
    };

    const openSuggestPanel = async (roundId: string) => {
        setShowSuggestPanel(prev => ({ ...prev, [roundId]: true }));
        setLoadingSuggestions(prev => ({ ...prev, [roundId]: true }));
        setRoundErrors(prev => ({ ...prev, [roundId]: '' }));
        try {
            const data = await getSuggestedReviewersRequest(roundId);
            const alreadyProposed = new Set((proposedMap[roundId] ?? []).map(p => p.id));
            setSuggestionsMap(prev => ({ ...prev, [roundId]: data.filter(s => !alreadyProposed.has(s.user.id)) }));
        } catch (e) {
            setRoundErrors(prev => ({ ...prev, [roundId]: e instanceof ApiError ? e.message : 'Failed to load suggestions' }));
        } finally {
            setLoadingSuggestions(prev => ({ ...prev, [roundId]: false }));
        }
    };

    const handleAddProposed = async (roundId: string, reviewerId: string) => {
        try {
            const updated = await addProposedReviewerRequest(roundId, reviewerId);
            setProposedMap(prev => ({ ...prev, [roundId]: updated }));
            setSuggestionsMap(prev => ({ ...prev, [roundId]: (prev[roundId] ?? []).filter(s => s.user.id !== reviewerId) }));
        } catch (e) {
            setRoundErrors(prev => ({ ...prev, [roundId]: e instanceof ApiError ? e.message : 'Failed to add reviewer' }));
        }
    };

    const handleRemoveProposed = async (roundId: string, userId: string) => {
        try {
            const updated = await removeProposedReviewerRequest(roundId, userId);
            setProposedMap(prev => ({ ...prev, [roundId]: updated }));
        } catch (e) {
            setRoundErrors(prev => ({ ...prev, [roundId]: e instanceof ApiError ? e.message : 'Failed to remove reviewer' }));
        }
    };

    const openAiUpload = (roundId: string) => {
        pendingAiRoundId.current = roundId;
        aiFileRef.current?.click();
    };

    const handleAIFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const roundId = pendingAiRoundId.current;
        e.target.value = '';
        if (!file || !roundId) return;

        setRunningAiRoundId(roundId);
        setRoundErrors(prev => ({ ...prev, [roundId]: '' }));
        setAiStatusByRound(prev => ({ ...prev, [roundId]: AI_PHASES[0].msg }));

        const start = Date.now();
        const ticker = window.setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            const phase = [...AI_PHASES].reverse().find(p => elapsed >= p.at);
            if (phase) setAiStatusByRound(prev => ({ ...prev, [roundId]: phase.msg }));
        }, 1000);

        try {
            const res = await startAIReviewRequest(roundId, file);
            setAiResultsByRound(prev => ({ ...prev, [roundId]: res.data }));
            await refreshRounds();
        } catch (e) {
            setRoundErrors(prev => ({ ...prev, [roundId]: e instanceof ApiError ? e.message : 'AI Review failed' }));
        } finally {
            window.clearInterval(ticker);
            setAiStatusByRound(prev => ({ ...prev, [roundId]: '' }));
            setRunningAiRoundId(null);
            pendingAiRoundId.current = null;
        }
    };

    const handleOpenRatingModal = (assignmentId: string) => {
        setRatingAssignmentId(assignmentId);
        setQualityScore(5);
        setQuantityScore(5);
        setTimeScore(5);
        setRatingError('');
        setRatingModalOpen(true);
    };

    const handleSubmitRating = async () => {
        if (!ratingAssignmentId) return;
        setSubmittingRating(true);
        setRatingError('');
        try {
            await submitRatingRequest(ratingAssignmentId, qualityScore, quantityScore, timeScore);
            if (paperHistory) {
                const updatedHistory = { ...paperHistory };
                updatedHistory.rounds.forEach(r => {
                    r.assignments.forEach(a => {
                        if (a.assignmentId === ratingAssignmentId) {
                            a.hasRating = true;
                        }
                    });
                });
                setPaperHistory(updatedHistory);
            }
            setRatingModalOpen(false);
        } catch (e) {
            setRatingError(e instanceof ApiError ? e.message : 'Failed to submit rating');
        } finally {
            setSubmittingRating(false);
        }
    };

    const formatDate = (value?: string | null) => {
        if (!value) return 'Not set';
        return new Date(value).toLocaleDateString();
    };

    const formatDateTime = (value?: string | null) => {
        if (!value) return 'Not recorded';
        const date = new Date(value);
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const getAssignmentStatusColor = (status: string) => {
        switch (status) {
            case 'Accepted':
            case 'Completed':
                return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'Declined':
            case 'Cancelled':
                return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'PendingDecline':
            case 'PendingExtension':
            case 'Overdue':
                return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            case 'Reassigned':
                return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
            default:
                return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        }
    };

    const toggleHistoryRound = (key: string) => {
        setExpandedHistoryRounds(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const toggleHistoryAssignment = (key: string) => {
        setExpandedHistoryAssignments(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const toggleHistoryCategory = (key: string) => {
        setExpandedHistoryCategories(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const renderPaperHistory = () => {
        const isAuthor = paperHistory?.authors?.some(a => a.id === user.id) || paper.authors?.some(a => a.id === user.id);
        const isCoordinator = user.isCoordinator;

        return (
            <div className="glass p-8 rounded-2xl border border-white/5">
            <button
                onClick={() => setHistoryExpanded(prev => !prev)}
                className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 text-left"
            >
                <div className="flex items-start gap-3">
                    <div className="mt-1 text-slate-500">
                        {historyExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-white">History & Activity Log</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            {paperHistory?.title || paper.title} · {paperHistory?.targetVenue || paper.targetVenue}
                        </p>
                    </div>
                </div>
                <span className={`w-fit px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wider ${getStatusColor(paperHistory?.status || effectivePaperStatus)}`}>
                    {paperHistory?.status || effectivePaperStatus}
                </span>
            </button>

            {historyExpanded && (
            <div className="mt-6">
            {historyError && !paperHistory ? (
                <p className="text-sm text-slate-500">{historyError}</p>
            ) : !paperHistory?.rounds?.length ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-sm text-slate-500">No review rounds recorded yet.</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {paperHistory.rounds.map(round => {
                        const roundKey = round.id || `round-${round.roundNumber}`;
                        const isRoundExpanded = expandedHistoryRounds.has(roundKey);
                        return (
                            <section key={round.id || round.roundNumber} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                                <button
                                    onClick={() => toggleHistoryRound(roundKey)}
                                    className="w-full p-5 border-b border-white/5 text-left hover:bg-white/[0.02] transition-colors"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 text-slate-500">
                                                {isRoundExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </div>
                                            <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-white font-semibold">Round {round.roundNumber}</h3>
                                                {round.assignments.some(a => a.status === 'Completed' && !a.hasRating) && (
                                                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)] border border-purple-400/20" title="Waiting rating" />
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Started: {formatDateTime(round.startedAt)} · Completed: {formatDateTime(round.completedAt)}
                                            </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className={`px-2.5 py-1 rounded-full border ${getStatusColor(round.roundStatus)}`}>
                                                {round.roundStatus}
                                            </span>
                                            <span className="px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-slate-300">
                                                Deadline: {formatDate(round.deadline)}
                                            </span>
                                        </div>
                                    </div>
                                </button>

                                {isRoundExpanded && (
                                <div className="divide-y divide-white/5">
                                    {round.assignments.length === 0 ? (
                                        <p className="p-5 text-sm text-slate-500">No reviewers assigned in this round.</p>
                                    ) : round.assignments.map(assignment => {
                                        const assignmentKey = assignment.assignmentId;
                                        const isAssignmentExpanded = expandedHistoryAssignments.has(assignmentKey);
                                        const declineCategoryKey = `${assignmentKey}:declines`;
                                        const extensionCategoryKey = `${assignmentKey}:extensions`;
                                        const isDeclinesExpanded = expandedHistoryCategories.has(declineCategoryKey);
                                        const isExtensionsExpanded = expandedHistoryCategories.has(extensionCategoryKey);
                                        const hasStandaloneDeclineReason = Boolean(
                                            assignment.declineReason &&
                                            !assignment.declineRequests.some(request =>
                                                request.reason.trim() === assignment.declineReason?.trim()
                                            )
                                        );
                                        const declineItemCount = assignment.declineRequests.length + (hasStandaloneDeclineReason ? 1 : 0);

                                        return (
                                        <div key={assignment.assignmentId} className="p-5">
                                            <button
                                                onClick={() => toggleHistoryAssignment(assignmentKey)}
                                                className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 text-left"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 text-slate-500">
                                                        {isAssignmentExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-white">
                                                            {assignment.reviewerName || 'Unassigned reviewer'}
                                                        </p>
                                                        {assignment.reviewerEmail && (
                                                            <p className="text-xs text-slate-500 mt-0.5">{assignment.reviewerEmail}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {declineItemCount > 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-xs border border-red-500/20 bg-red-500/10 text-red-300">
                                                            {declineItemCount} decline
                                                        </span>
                                                    )}
                                                    {assignment.extensions.length > 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-xs border border-amber-500/20 bg-amber-500/10 text-amber-300">
                                                            {assignment.extensions.length} extension
                                                        </span>
                                                    )}
                                                    <span className={`w-fit px-2.5 py-1 rounded-full text-xs font-medium border ${getAssignmentStatusColor(assignment.status)}`}>
                                                        {assignment.status}
                                                    </span>
                                                </div>
                                            </button>

                                            {isAssignmentExpanded && (
                                            <>

                                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
                                                <span>Invited: {formatDateTime(assignment.invitedAt)}</span>
                                                <span>Accepted: {formatDateTime(assignment.acceptedAt)}</span>
                                                <span>Submitted: {formatDateTime(assignment.submittedAt)}</span>
                                                <span>Assignment deadline: {formatDate(assignment.deadline)}</span>
                                            </div>

                                            {declineItemCount > 0 && (
                                                <div className="mt-4 space-y-2">
                                                    <button
                                                        onClick={() => toggleHistoryCategory(declineCategoryKey)}
                                                        className="w-full flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-left"
                                                    >
                                                        <span className="text-xs font-semibold text-red-300">Declines ({declineItemCount})</span>
                                                        {isDeclinesExpanded ? <ChevronUp className="w-4 h-4 text-red-300" /> : <ChevronDown className="w-4 h-4 text-red-300" />}
                                                    </button>
                                                    {isDeclinesExpanded && (
                                                    <div className="space-y-2">
                                                    {hasStandaloneDeclineReason && assignment.declineReason && (
                                                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                                            <p className="text-xs font-semibold text-red-300">Decline reason</p>
                                                            <p className="text-sm text-slate-300 mt-1">{assignment.declineReason}</p>
                                                        </div>
                                                    )}
                                                    {assignment.declineRequests.map(request => (
                                                        <div key={request.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <p className="text-xs font-semibold text-red-300">Decline request</p>
                                                                <span className="text-xs text-red-200">{request.status}</span>
                                                            </div>
                                                            <p className="text-sm text-slate-300 mt-1">{request.reason}</p>
                                                            <p className="text-xs text-slate-500 mt-2">Requested: {formatDateTime(request.requestedAt)}</p>
                                                        </div>
                                                    ))}
                                                    </div>
                                                    )}
                                                </div>
                                            )}

                                            {assignment.extensions.length > 0 && (
                                                <div className="mt-4 space-y-2">
                                                    <button
                                                        onClick={() => toggleHistoryCategory(extensionCategoryKey)}
                                                        className="w-full flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-left"
                                                    >
                                                        <span className="text-xs font-semibold text-amber-300">Extension Requests ({assignment.extensions.length})</span>
                                                        {isExtensionsExpanded ? <ChevronUp className="w-4 h-4 text-amber-300" /> : <ChevronDown className="w-4 h-4 text-amber-300" />}
                                                    </button>
                                                    {isExtensionsExpanded && (
                                                    <div className="space-y-2">
                                                    {assignment.extensions.map(extension => (
                                                        <div key={extension.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <p className="text-xs font-semibold text-amber-300">Extension request</p>
                                                                <span className="text-xs text-amber-200">{extension.status}</span>
                                                            </div>
                                                            <p className="text-sm text-slate-300 mt-1">{extension.reason}</p>
                                                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                                                                <span>Requested deadline: {formatDate(extension.requestedDeadline)}</span>
                                                                <span>Approved deadline: {formatDate(extension.approvedDeadline)}</span>
                                                                <span>Requested: {formatDateTime(extension.requestedAt)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    </div>
                                                    )}
                                                </div>
                                            )}

                                            </>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>
                                )}

                            </section>
                        );
                    })}
                </div>
            )}
            </div>
            )}
        </div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto py-4 animate-in fade-in duration-500 mb-20">
            <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" />
                Back to Papers
            </Link>

            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                        <h1 className="text-3xl font-bold text-white tracking-tight">{paper.title}</h1>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wider ${getStatusColor(effectivePaperStatus)}`}>
                            {effectivePaperStatus}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 mb-4 flex-wrap group/topics cursor-pointer relative">
                        {paper.topics?.map((topic) => (
                            <span key={topic.id} className="px-2 py-1 rounded bg-white/10 text-slate-300 text-xs font-medium border border-white/5">
                                {topic.name}
                            </span>
                        ))}
                        {canEditAbstract && !isEditingTopics && (
                            <button
                                onClick={() => setIsEditingTopics(true)}
                                className="opacity-0 group-hover/topics:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 ml-2"
                            >
                                <Edit className="w-3 h-3" /> Edit Topics
                            </button>
                        )}
                        {isEditingTopics && (
                            <div className="absolute left-0 top-full mt-2 bg-slate-900 border border-white/10 p-4 rounded-xl shadow-2xl z-50 min-w-[300px]">
                                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Select Topics</h4>
                                
                                <div className="relative mb-3">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Search..." 
                                        value={topicSearch}
                                        onChange={(e) => setTopicSearch(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-6 pr-2 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2 mb-4 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                    {availableTopics
                                        .filter(t => t.name.toLowerCase().includes(topicSearch.toLowerCase()))
                                        .map(topic => (
                                        <button
                                            key={topic.id}
                                            type="button"
                                            onClick={() => toggleTopic(topic.id)}
                                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${localTopics.includes(topic.id) ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}
                                        >
                                            {topic.name}
                                        </button>
                                    ))}
                                </div>
                                {topicsError && <p className="text-xs text-red-400">{topicsError}</p>}
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={async () => { if (await confirmCancel()) { setLocalTopics(paper.topics?.map(t => t.id) || []); setTopicsError(''); setIsEditingTopics(false); } }}
                                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveTopics}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                                    >
                                        Save Topics
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>


                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            {paper.overleafLink ? (
                                <a href={paper.overleafLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 bg-blue-500/10 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/20 w-fit">
                                    <ExternalLink className="w-4 h-4" />
                                    Open Overleaf
                                </a>
                            ) : (
                                <span className="inline-flex items-center gap-2 text-sm text-slate-500 bg-white/[0.02] px-3 py-1.5 rounded-lg border border-white/10 w-fit">
                                    <ExternalLink className="w-4 h-4" />
                                    No Overleaf link
                                </span>
                            )}
                            {canEditLinks && !isEditingLinks && (
                                <button
                                    onClick={() => {
                                        setLocalOverleafLink(paper.overleafLink || '');
                                        setLinksError('');
                                        setIsEditingLinks(true);
                                    }}
                                    className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-white/[0.04] px-3 py-1.5 rounded-lg transition-colors border border-white/10 w-fit"
                                >
                                    <Edit className="w-4 h-4" />
                                    Edit Links
                                </button>
                            )}
                        </div>

                        {canEditLinks && isEditingLinks && (
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3 max-w-2xl">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-400 uppercase tracking-wider">Overleaf manuscript link <span className="text-red-400">*</span></label>
                                    <input
                                        type="url"
                                        value={localOverleafLink}
                                        onChange={(e) => setLocalOverleafLink(e.target.value)}
                                        placeholder="https://www.overleaf.com/..."
                                        className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                    />
                                </div>
                                {linksError && <p className="text-xs text-red-400">{linksError}</p>}
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={async () => {
                                            if (!(await confirmCancel())) return;
                                            setLocalOverleafLink(paper.overleafLink || '');
                                            setLinksError('');
                                            setIsEditingLinks(false);
                                        }}
                                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveLinks}
                                        disabled={savingLinks}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {savingLinks ? 'Saving...' : 'Save Links'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons based on Role & State */}
                <div className="flex flex-col gap-3 shrink-0 lg:min-w-48">
                    {/* Coordinator Draft Actions */}
                    {user.isCoordinator && effectivePaperStatus === 'Draft' && (
                        <Link
                            href={`/rounds?paper=${paper.id}`}
                            className="w-full px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                        >
                            <Play className="w-4 h-4" />
                            Start Round & Assign
                        </Link>
                    )}

                    {/* Coordinator Active Actions */}
                    {user.isCoordinator && effectivePaperStatus === 'In Review' && (
                        <Link
                            href={`/rounds?paper=${paper.id}`}
                            className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                        >
                            <UserPlus className="w-4 h-4" />
                            Assign Reviewers
                        </Link>
                    )}

                    {/* Send Reminder + Run AI Review — coordinator and authors */}
                    {(user.isCoordinator || isAuthor) && effectivePaperStatus === 'In Review' && (() => {
                        const openRound = authorRounds.find(r => r.status === 'Open');
                        return (
                            <>
                            <button
                                onClick={handleSendReminder}
                                disabled={isSendingReminder || reminderSent || !openRound}
                                className={`w-full px-5 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 border
                                        ${reminderSent
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                        : !openRound ? 'bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/20'
                                    } disabled:opacity-50`}
                            >
                                {isSendingReminder ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : reminderSent ? (
                                    <><CheckCircle2 className="w-4 h-4" /> Reminder Sent</>
                                ) : (
                                    <><Clock className="w-4 h-4" /> Send Reminder</>
                                )}
                            </button>
                            {reminderError && <p className="text-xs text-red-400">{reminderError}</p>}
                            {openRound && isAuthor && (
                                <button
                                    onClick={() => openAiUpload(openRound.id)}
                                    disabled={runningAiRoundId === openRound.id}
                                    className="w-full px-5 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {runningAiRoundId === openRound.id
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
                                        : <><Cpu className="w-4 h-4" /> Run AI Review</>}
                                </button>
                            )}
                            </>
                        );
                    })()}

                    {canChangeAcceptState && (() => {
                        const now = new Date();
                        const hasFutureDeadline = authorRounds.some(r => r.submissionDeadline && new Date(r.submissionDeadline) > now);
                        const hasActiveRound = authorRounds.some(r => r.status === 'Draft' || r.status === 'Open');
                        const isAcceptDisabled = isAccepting || hasFutureDeadline || hasActiveRound;
                        
                        return (
                            <>
                                {effectivePaperStatus !== 'Accepted' && (
                                    <div className="space-y-2">
                                        <button
                                            onClick={handleAccept}
                                            disabled={isAcceptDisabled}
                                            className="w-full px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                            title={hasFutureDeadline ? "Cannot accept before submission deadline has passed" : hasActiveRound ? "Cannot accept while a review round is active" : ""}
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            Accept Paper
                                        </button>
                                        {isAcceptDisabled && !isAccepting && (
                                            <p className="text-xs text-slate-500 text-center">
                                                {hasActiveRound ? "Cannot accept while a review round is active." : "Cannot accept before submission deadline has passed."}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {acceptError && (
                                    <p className="text-xs text-red-400 leading-relaxed">{acceptError}</p>
                                )}
                            </>
                        );
                    })()}


                    {/* Reviewer Actions */}
                    {!user.isCoordinator && effectivePaperStatus === 'In Review' && myAssignment?.status === 'Pending' && !showDeclineForm && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setLocalAssignmentStatus('Accepted')}
                                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Accept
                            </button>
                            <button
                                onClick={() => setShowDeclineForm(true)}
                                className="flex-1 px-4 py-2.5 bg-red-600/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <XCircle className="w-4 h-4" />
                                Decline
                            </button>
                        </div>
                    )}

                    {/* Decline Reason Form */}
                    {!user.isCoordinator && effectivePaperStatus === 'In Review' && myAssignment?.status === 'Pending' && showDeclineForm && (
                        <div className="glass p-4 rounded-xl border border-red-500/30 mt-2 bg-red-500/5 animate-in slide-in-from-top-2">
                            <label className="block text-xs font-medium text-slate-300 mb-2">Reason for declining <span className="text-red-400">*</span></label>
                            <textarea
                                value={declineReason}
                                onChange={(e) => setDeclineReason(e.target.value)}
                                rows={2}
                                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/50 resize-none mb-3"
                                placeholder="E.g., Conflict of interest, busy schedule..."
                            />
                            <div className="flex gap-2">
                                <button onClick={async () => { if (await confirmCancel()) setShowDeclineForm(false); }} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
                                <button
                                    onClick={() => {
                                        setLocalAssignmentStatus('Declined');
                                        setShowDeclineForm(false);
                                    }}
                                    disabled={!declineReason.trim()}
                                    className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Submit Decline
                                </button>
                            </div>
                        </div>
                    )}

                    {!user.isCoordinator && effectivePaperStatus === 'In Review' && myAssignment?.status === 'Accepted' && localAssignmentStatus !== 'Submitted' && (
                        <div className="space-y-2">
                            <button
                                onClick={handleSubmitReview}
                                disabled={isSubmittingReview}
                                className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSubmittingReview ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <><CheckCircle2 className="w-4 h-4" /> Submit Review</>
                                )}
                            </button>

                            {!hasRequestedExtension[myAssignment.id] && !showExtensionForm && (
                                <button
                                    onClick={() => setShowExtensionForm(true)}
                                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Clock className="w-4 h-4" /> Request Extension
                                </button>
                            )}

                            {showExtensionForm && !hasRequestedExtension[myAssignment.id] && (
                                <div className="glass p-4 rounded-xl border border-amber-500/30 mt-2 bg-amber-500/5 animate-in slide-in-from-top-2">
                                    <label className="block text-xs font-medium text-slate-300 mb-2">Reason for extension <span className="text-amber-400">*</span></label>
                                    <textarea
                                        value={extensionReason}
                                        onChange={(e) => setExtensionReason(e.target.value)}
                                        rows={2}
                                        className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none mb-3"
                                        placeholder="E.g., Need more time to verify the experimental results..."
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={async () => { if (await confirmCancel()) setShowExtensionForm(false); }} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
                                        <button
                                            onClick={() => {
                                                setHasRequestedExtension(prev => ({ ...prev, [myAssignment.id]: true }));
                                                setShowExtensionForm(false);
                                            }}
                                            disabled={!extensionReason.trim()}
                                            className="flex-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            Submit Request
                                        </button>
                                    </div>
                                </div>
                            )}

                            {hasRequestedExtension[myAssignment.id] && !extensionStatus[myAssignment.id] && (
                                <div className="w-full px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium rounded-lg flex flex-col items-center justify-center gap-1">
                                    <Clock className="w-4 h-4 mb-1" />
                                    Extension Requested
                                    <span className="text-xs text-amber-500/70 font-normal">Pending coordinator approval</span>
                                </div>
                            )}

                            {extensionStatus[myAssignment.id] === 'Approved' && (
                                <div className="w-full px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Extension Approved
                                </div>
                            )}

                            {extensionStatus[myAssignment.id] === 'Rejected' && (
                                <div className="w-full px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                                    <XCircle className="w-4 h-4" />
                                    Extension Rejected
                                </div>
                            )}
                        </div>
                    )}

                    {!user.isCoordinator && (myAssignment?.status === 'Submitted' || localAssignmentStatus === 'Submitted') && (
                        <div className="w-full border border-emerald-500/30 bg-emerald-500/5 rounded-xl overflow-hidden mt-2">
                            <div className="bg-emerald-500/10 px-5 py-3 flex items-center gap-2 border-b border-emerald-500/20">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                <span className="text-emerald-400 font-semibold text-sm">Review Submitted Successfully</span>
                            </div>
                            <div className="p-5 space-y-4">
                                <p className="text-sm text-slate-300">Thank you for your valuable feedback. Here is a summary of your evaluation:</p>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                                        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Recommendation</div>
                                        <div className="text-emerald-400 font-medium text-sm">Accept (Minor Revisions)</div>
                                    </div>
                                    <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                                        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Confidence Rating</div>
                                        <div className="text-blue-400 font-medium text-sm">4 / 5 (High)</div>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <div>
                                        <h4 className="text-xs text-emerald-500 uppercase tracking-wider mb-1 font-semibold flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Key Strengths
                                        </h4>
                                        <ul className="text-sm text-slate-300 list-disc list-inside space-y-1 ml-1">
                                            <li>Strong methodological rigor in the empirical study.</li>
                                            <li>Clear and concise writing style.</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <h4 className="text-xs text-amber-500 uppercase tracking-wider mb-1 font-semibold flex items-center gap-1">
                                            <XCircle className="w-3 h-3" /> Areas for Improvement
                                        </h4>
                                        <ul className="text-sm text-slate-300 list-disc list-inside space-y-1 ml-1">
                                            <li>Some references in the related work section are outdated.</li>
                                            <li>Figure 3 could be more legible.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="glass p-8 rounded-2xl border border-white/5 relative group">
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="text-xl font-semibold text-white">Abstract</h2>
                            {canEditAbstract && !isEditingAbstract && (
                                <button
                                    onClick={() => setIsEditingAbstract(true)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                                >
                                    <Edit className="w-3 h-3" /> Edit
                                </button>
                            )}
                        </div>

                        {isEditingAbstract && canEditAbstract ? (
                            <div className="space-y-3">
                                <textarea
                                    value={localAbstract}
                                    onChange={(e) => setLocalAbstract(e.target.value)}
                                    rows={6}
                                    className="w-full bg-background border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-y"
                                />
                                {abstractError && <p className="text-xs text-red-400">{abstractError}</p>}
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={async () => { if (await confirmCancel()) { setLocalAbstract(paper.abstractText || ''); setAbstractError(''); setIsEditingAbstract(false); } }}
                                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveAbstract}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap">
                                {localAbstract}
                            </p>
                        )}
                    </div>

                    {/* Coordinator: compact round status card */}
                    {user.isCoordinator && (() => {
                        const latestRound = authorRounds.length > 0
                            ? authorRounds.reduce((a, b) => a.roundNumber > b.roundNumber ? a : b)
                            : null;
                        const pendingProposals = latestRound?.status === 'Draft'
                            ? (proposedMap[latestRound.id] ?? latestRound.proposedReviewers ?? []).length
                            : 0;
                        const roundStatusColor = latestRound?.status === 'Draft'
                            ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                            : latestRound?.status === 'Open'
                                ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                : 'text-slate-400 border-slate-500/30 bg-slate-500/10';
                        return (
                            <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <h2 className="text-xl font-semibold text-white">Round Overview</h2>
                                    <Link
                                        href={`/rounds?paper=${paper.id}`}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        Manage in Round Overview
                                    </Link>
                                </div>
                                {loadingRounds && <p className="text-sm text-slate-400">Loading…</p>}
                                {!loadingRounds && !latestRound && (
                                    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5 text-center space-y-2">
                                        <p className="text-sm text-slate-400">No round created yet.</p>
                                        <Link href={`/rounds?paper=${paper.id}`} className="text-xs text-blue-400 hover:text-blue-300 block">
                                            → Create a round in Round Overview
                                        </Link>
                                    </div>
                                )}
                                {!loadingRounds && latestRound && (
                                    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 space-y-3">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <div className="relative shrink-0">
                                                <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold">
                                                    {latestRound.roundNumber}
                                                </div>
                                                {paperHistory?.rounds?.find(r => r.roundNumber === latestRound.roundNumber)?.assignments?.some(a => a.status === 'Completed' && !a.hasRating) && (
                                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-500 border-2 border-slate-900 shadow-[0_0_8px_rgba(168,85,247,0.5)]" title="Waiting rating" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white">{latestRound.targetVenue || `Round ${latestRound.roundNumber}`}</p>
                                                <p className="text-xs text-slate-500">{latestRound.venueCategory}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-xs border ${roundStatusColor}`}>{latestRound.status}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            {latestRound.venueCategory === 'Conference' && latestRound.submissionDeadline && (
                                                <div>
                                                    <p className="text-xs text-slate-500">Submission Deadline</p>
                                                    <p className="text-white">{new Date(latestRound.submissionDeadline).toLocaleDateString()}</p>
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-xs text-slate-500">Round Deadline</p>
                                                <p className="text-white">{latestRound.deadline ? new Date(latestRound.deadline).toLocaleDateString() : '—'}</p>
                                            </div>
                                        </div>
                                        {pendingProposals > 0 && (
                                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                                <span>{pendingProposals} reviewer proposal{pendingProposals > 1 ? 's' : ''} pending your approval</span>
                                                <Link href={`/rounds?paper=${paper.id}`} className="ml-auto text-amber-300 hover:text-amber-200 font-medium">Review →</Link>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Author (non-coordinator): full round management */}
                    {isAuthor && !user.isCoordinator && (
                        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
                            <input ref={aiFileRef} type="file" accept="application/pdf" className="hidden" onChange={handleAIFileSelected} />
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <h2 className="text-xl font-semibold text-white">Round</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {authorRounds.length === 0
                                            ? 'No round created yet'
                                            : authorRounds.some(r => r.status === 'Draft')
                                                ? 'Draft — propose reviewers for coordinator approval'
                                                : authorRounds.some(r => r.status === 'Open')
                                                    ? 'Open — review in progress'
                                                    : 'Completed'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(() => {
                                        const hasActive = authorRounds.some(r => r.status === 'Draft' || r.status === 'Open');
                                        return !hasActive && !showCreateRound ? (
                                            <button
                                                onClick={() => setShowCreateRound(true)}
                                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                                {authorRounds.length === 0 ? 'Create Initial Round' : 'Create Next Round'}
                                            </button>
                                        ) : null;
                                    })()}
                                </div>
                            </div>

                            {/* Create round form */}
                            {showCreateRound && (
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-4">
                                    <h3 className="text-sm font-semibold text-blue-400">Setup Draft Round</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-400 uppercase tracking-wider">Venue Category</label>
                                            <select value={newVenueCat} onChange={e => setNewVenueCat(e.target.value)}
                                                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                                                <option value="Conference">Conference</option>
                                                <option value="Journal">Journal</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-400 uppercase tracking-wider">Target Venue Name</label>
                                            <input type="text" value={newTargetVenue} onChange={e => setNewTargetVenue(e.target.value)}
                                                placeholder="e.g. NeurIPS 2026"
                                                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                                        </div>
                                        <div className="space-y-1 sm:col-span-2">
                                            <label className="text-xs text-slate-400 uppercase tracking-wider">Venue URL</label>
                                            <input type="text" value={newTargetVenueUrl} onChange={e => setNewTargetVenueUrl(e.target.value)}
                                                placeholder="https://neurips.cc/Conferences/2026"
                                                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                                            <p className="text-[11px] text-amber-400/80 flex items-center gap-1 mt-1 font-medium">
                                                <AlertCircle className="w-3 h-3" /> Please double-check the venue URL. It cannot be changed after the round is created.
                                            </p>
                                        </div>
                                        {newVenueCat === 'Conference' && (
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-400 uppercase tracking-wider">Submission Deadline</label>
                                                <input type="date" value={newSubDeadline} onChange={e => setNewSubDeadline(e.target.value)}
                                                    min={todayInputValue()}
                                                    className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-400 uppercase tracking-wider">Round Deadline (optional)</label>
                                            <input type="date" value={newRoundDeadline} onChange={e => setNewRoundDeadline(e.target.value)}
                                                min={todayInputValue()}
                                                max={newVenueCat === 'Conference' && newSubDeadline ? newSubDeadline : undefined}
                                                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                                        </div>
                                    </div>
                                    {createRoundError && <p className="text-xs text-red-400">{createRoundError}</p>}
                                    <div className="flex gap-3">
                                        <button onClick={handleCreateRound}
                                            disabled={creatingRound || !newTargetVenue.trim() || !newTargetVenueUrl.trim() || (newVenueCat === 'Conference' && !newSubDeadline)}
                                            className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors">
                                            {creatingRound ? 'Creating…' : 'Create Draft'}
                                        </button>
                                        <button onClick={async () => { if (await confirmCancel()) setShowCreateRound(false); }}
                                            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {loadingRounds && <p className="text-sm text-slate-400">Loading rounds…</p>}

                            {!loadingRounds && authorRounds.length === 0 && !showCreateRound && (
                                <p className="text-sm text-slate-500">No rounds yet. Create the first round to start proposing reviewers.</p>
                            )}

                            {/* Round list */}
                            {authorRounds.map(round => {
                                const proposed = proposedMap[round.id] ?? [];
                                const suggestions = suggestionsMap[round.id] ?? [];
                                const isExpanded = expandedRound === round.id;
                                const statusColor = round.status === 'Draft' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                                    : round.status === 'Open' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                    : 'text-slate-400 border-slate-500/30 bg-slate-500/10';
                                const aiReviews = round.aiReviewReports ?? round.artifacts?.aiReviewReports ?? [];
                                const recentAiResult = aiResultsByRound[round.id];

                                return (
                                    <div key={round.id} className="rounded-xl border border-white/10 overflow-hidden">
                                        <button
                                            onClick={() => setExpandedRound(isExpanded ? null : round.id)}
                                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold">
                                                        {round.roundNumber}
                                                    </div>
                                                    {paperHistory?.rounds?.find(r => r.roundNumber === round.roundNumber)?.assignments?.some(a => a.status === 'Completed' && !a.hasRating) && (
                                                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-500 border-2 border-slate-900 shadow-[0_0_8px_rgba(168,85,247,0.5)]" title="Waiting rating" />
                                                    )}
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-sm font-medium text-white">{round.targetVenue || `Round ${round.roundNumber}`}</p>
                                                    <p className="text-xs text-slate-500">{round.venueCategory} · Deadline: {round.deadline ? new Date(round.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor}`}>{round.status}</span>
                                                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-white/5 px-4 py-3 space-y-3 bg-white/[0.01]">
                                                {/* Venue link */}
                                                {round.targetVenueUrl && (
                                                    <div className="flex items-center gap-1.5 text-xs">
                                                        <span className="text-slate-500">Venue:</span>
                                                        <a href={round.targetVenueUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline truncate">{round.targetVenueUrl}</a>
                                                    </div>
                                                )}
                                                {/* Config */}
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    {round.venueCategory === 'Conference' && (
                                                        <div>
                                                            <p className="text-xs text-slate-500 mb-0.5">Submission Deadline</p>
                                                            {editingSubmissionDeadline === round.id ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input type="date" value={submissionDeadlineDraft} onChange={e => { setSubmissionDeadlineDraft(e.target.value); setRoundErrors(prev => ({ ...prev, [round.id]: '' })); }}
                                                                        min={maxDateInputValue(todayInputValue(), round.deadline ? toLocalDateInput(round.deadline) : undefined)}
                                                                        className="bg-background border border-white/10 rounded px-2 py-0.5 text-xs text-white" />
                                                                    <button onClick={() => handleSaveSubmissionDeadline(round.id)} disabled={!submissionDeadlineDraft} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded text-white disabled:opacity-50">Save</button>
                                                                    <button onClick={async () => { if (await confirmCancel()) setEditingSubmissionDeadline(null); }} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-white">{round.submissionDeadline ? new Date(round.submissionDeadline).toLocaleDateString() : '—'}</p>
                                                                    {round.status !== 'Completed' && (
                                                                        <button onClick={() => { setEditingSubmissionDeadline(round.id); setSubmissionDeadlineDraft(round.submissionDeadline ? toLocalDateInput(round.submissionDeadline) : ''); }}
                                                                            className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded">
                                                                            Edit
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-xs text-slate-500 mb-0.5">Round Deadline</p>
                                                        {round.status !== 'Completed' && editingRoundDeadline === round.id ? (
                                                            <div className="flex items-center gap-2">
                                                                <input type="date" value={roundDeadlineDraft} onChange={e => { setRoundDeadlineDraft(e.target.value); setRoundErrors(prev => ({ ...prev, [round.id]: '' })); }}
                                                                    min={todayInputValue()}
                                                                    max={round.submissionDeadline ? toLocalDateInput(round.submissionDeadline) : undefined}
                                                                    className="bg-background border border-white/10 rounded px-2 py-0.5 text-xs text-white" />
                                                                <button onClick={() => handleSaveRoundDeadline(round.id)} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded text-white">Save</button>
                                                                <button onClick={async () => { if (await confirmCancel()) setEditingRoundDeadline(null); }} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-white">{round.deadline ? new Date(round.deadline).toLocaleDateString() : '—'}</p>
                                                                {round.status !== 'Completed' && (
                                                                    <button onClick={() => { setEditingRoundDeadline(round.id); setRoundDeadlineDraft(round.deadline ? toLocalDateInput(round.deadline) : ''); }}
                                                                        className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded">
                                                                        Edit
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>


                                                {round.status === 'Draft' && (
                                                    <>
                                                        {/* Proposed reviewers */}
                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                                                    Proposed Reviewers ({proposed.length})
                                                                </p>
                                                                <button
                                                                    onClick={() => showSuggestPanel[round.id] ? setShowSuggestPanel(prev => ({ ...prev, [round.id]: false })) : openSuggestPanel(round.id)}
                                                                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-1 rounded"
                                                                >
                                                                    <UserPlus className="w-3 h-3" /> Add Reviewer
                                                                </button>
                                                            </div>

                                                            {proposed.length === 0 && (
                                                                <p className="text-xs text-slate-500 italic">No reviewers proposed yet. Use the suggestions below to build your list.</p>
                                                            )}
                                                            {proposed.map(r => (
                                                                <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02]">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">
                                                                            {r.name.charAt(0)}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <p className="text-sm text-white truncate">{r.name}</p>
                                                                                {r.hasPreviouslyCompletedReview && (
                                                                                    <span
                                                                                        title="This reviewer has previously completed a review for this paper."
                                                                                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-300"
                                                                                    >
                                                                                        !
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <p className="text-xs text-slate-500 truncate">{r.email}</p>
                                                                        </div>
                                                                    </div>
                                                                    <button onClick={() => handleRemoveProposed(round.id, r.id)}
                                                                        className="ml-2 text-slate-500 hover:text-red-400 transition-colors shrink-0">
                                                                        <XCircle className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            ))}

                                                            {showSuggestPanel[round.id] && (
                                                                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                                                                    <p className="text-xs font-semibold text-slate-400">System suggestions (eligible lab members):</p>
                                                                    {loadingSuggestions[round.id] ? (
                                                                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                                                                        </div>
                                                                    ) : suggestions.length === 0 ? (
                                                                        <p className="text-xs text-slate-500">No eligible reviewers found.</p>
                                                                    ) : (
                                                                        <div className="space-y-1 max-h-48 overflow-y-auto">
                                                                            {suggestions.map(s => (
                                                                                <div key={s.user.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02]">
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                                                            <p className="text-sm text-white truncate">{s.user.name}</p>
                                                                                            {s.hasPreviouslyCompletedReview && (
                                                                                                <span
                                                                                                    title="This reviewer has previously completed a review for this paper."
                                                                                                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-300"
                                                                                                >
                                                                                                    !
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <p className="text-xs text-slate-500 truncate">{s.user.email}</p>
                                                                                    </div>
                                                                                    <button onClick={() => handleAddProposed(round.id, s.user.id)}
                                                                                        className="ml-2 flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 transition-colors shrink-0">
                                                                                        <Plus className="w-3 h-3" /> Add
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <button onClick={() => setShowSuggestPanel(prev => ({ ...prev, [round.id]: false }))}
                                                                        className="text-xs text-slate-500 hover:text-slate-300">
                                                                        Close
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {proposed.length > 0 && (
                                                            <p className="text-xs text-slate-400 italic">
                                                                {proposed.length} reviewer(s) proposed. The coordinator will review and approve this list to start the round.
                                                            </p>
                                                        )}
                                                    </>
                                                )}

                                                {round.status !== 'Draft' && (
                                                    <div className="pt-3 border-t border-white/5 space-y-3">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <button
                                                                onClick={() => openAiUpload(round.id)}
                                                                disabled={runningAiRoundId === round.id}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {runningAiRoundId === round.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                                                                {runningAiRoundId === round.id ? 'Running…' : 'Run AI Review'}
                                                            </button>
                                                            {aiStatusByRound[round.id] && (
                                                                <span className="text-xs text-indigo-300 animate-pulse">{aiStatusByRound[round.id]}</span>
                                                            )}
                                                        </div>

                                                        {(aiReviews.length > 0 || recentAiResult) && (
                                                            <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-2">
                                                                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">My AI Review History</p>
                                                                <div className="space-y-2">
                                                                    {recentAiResult && (
                                                                        <div className="rounded-lg bg-slate-800/30 p-2 space-y-2">
                                                                            <p className="text-[10px] text-slate-500">Latest run</p>
                                                                            <p className="text-xs text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto">{recentAiResult.reviewText || recentAiResult.summaryReport}</p>
                                                                            {recentAiResult.annotatedPdfUrl && (
                                                                                <a href={recentAiResult.annotatedPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                                                                                    <Download className="w-3 h-3" /> Download Annotated PDF
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {aiReviews.map((review: any, idx: number) => (
                                                                        <details key={review.id} className="rounded-lg bg-slate-800/30">
                                                                            <summary className="cursor-pointer px-2 py-1.5 text-xs text-slate-300">
                                                                                Review #{aiReviews.length - idx}
                                                                                {review.createdAt && <span className="ml-2 text-[10px] text-slate-500">{new Date(review.createdAt).toLocaleString()}</span>}
                                                                            </summary>
                                                                            <div className="px-2 pb-2 space-y-2">
                                                                                <p className="text-xs text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto">{review.reviewText}</p>
                                                                                {review.annotatedPdfUrl && (
                                                                                    <a href={review.annotatedPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                                                                                        <Download className="w-3 h-3" /> Download Annotated PDF
                                                                                    </a>
                                                                                )}
                                                                            </div>
                                                                        </details>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                    </div>
                                                )}

                                                {round.status === 'Open' && (
                                                    <p className="text-xs text-emerald-400">Round is open — reviewers have been assigned and invited by the coordinator.</p>
                                                )}
                                                {round.status === 'Completed' && (() => {
                                                    const histRound = paperHistory?.rounds.find(r => r.id === round.id);
                                                    const completedAssignments = histRound?.assignments.filter(a => a.status === 'Completed' && a.reviewerName) ?? [];
                                                    return (
                                                        <div className="pt-3 border-t border-white/5 space-y-2">
                                                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reviewers</p>
                                                            {completedAssignments.length === 0 ? (
                                                                <p className="text-xs text-slate-500 italic">No completed reviews for this round.</p>
                                                            ) : (
                                                                <div className="space-y-2">
                                                                    {completedAssignments.map(a => (
                                                                        <div key={a.assignmentId} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02]">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">
                                                                                    {a.reviewerName!.charAt(0)}
                                                                                </div>
                                                                                <span className="text-sm text-white">{a.reviewerName}</span>
                                                                            </div>
                                                                            {a.hasRating ? (
                                                                                <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Rated
                                                                                </span>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => handleOpenRatingModal(a.assignmentId)}
                                                                                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                                                                                >
                                                                                    <Star className="w-3.5 h-3.5" /> Rate Reviewer
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                {roundErrors[round.id] && (
                                                    <p className="text-xs text-red-400">{roundErrors[round.id]}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                </div>

                <div className="space-y-6">
                    <div className="glass p-6 rounded-2xl border border-white/5">
                        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
                            Authors
                            {canEditAuthors && (
                                <button onClick={() => { setLocalAuthors(orderedPaperAuthorIds); setIsEditingAuthors(true); }} className="text-xs text-blue-400 hover:text-blue-300 capitalize flex items-center gap-1">
                                    <Edit className="w-3 h-3" /> Edit
                                </button>
                            )}
                        </h3>
                         <div className="space-y-4">
                            {isEditingAuthors ? (
                                <div className="space-y-6">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                                        <input 
                                            type="text" 
                                            placeholder="Search members..." 
                                            value={authorSearch}
                                            onChange={(e) => setAuthorSearch(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-2 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                                        />
                                    </div>

                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                        {(() => {
                                            const filtered = addableAuthorOptions.filter(u => 
                                                u.name.toLowerCase().includes(authorSearch.toLowerCase()) || 
                                                u.email.toLowerCase().includes(authorSearch.toLowerCase())
                                            );
                                            
                                            if (filtered.length === 0) {
                                                return (
                                                    <p className="text-[10px] text-slate-500 text-center py-4 border border-dashed border-white/5 rounded-lg">
                                                        {authorSearch ? 'No matches found.' : 'No more eligible members.'}
                                                    </p>
                                                );
                                            }
                                            
                                            return filtered.map(u => (
                                                <button
                                                    key={u.id}
                                                    type="button"
                                                    onClick={() => toggleAuthor(u.id)}
                                                    className="w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-all bg-white/5 border-white/10 hover:bg-white/10"
                                                >
                                                    <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-xs bg-slate-700 text-slate-300">
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium truncate text-slate-300">{u.name}</p>
                                                        <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                                                    </div>
                                                    <Plus className="w-3 h-3 text-blue-400 shrink-0" />
                                                </button>
                                            ));
                                        })()}
                                    </div>
                                    
                                    <div className="pt-4 border-t border-white/10 space-y-2">
                                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Order</h4>
                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {localAuthors.map((id, index) => {
                                                const u = authorDirectory[id];
                                                if (!u) return null;
                                                const canRemoveAuthor = removableAuthorIds.has(id) && !coordinatorAuthorIds.has(id);
                                                return (
                                                    <div key={id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                                                        <span className="text-xs text-blue-400 font-mono w-4">{index + 1}</span>
                                                        <span className="text-xs text-white truncate flex-1 px-2">
                                                            {u.name}
                                                            {coordinatorAuthorIds.has(id) && <span className="ml-1 text-[10px] text-blue-300">Coordinator</span>}
                                                        </span>
                                                        <div className="flex gap-1">
                                                            <button disabled={index === 0} onClick={() => moveAuthor(index, 'up')} className="p-1 hover:bg-white/10 rounded disabled:opacity-20"><ArrowUp className="w-3 h-3 text-slate-400" /></button>
                                                            <button disabled={index === localAuthors.length - 1} onClick={() => moveAuthor(index, 'down')} className="p-1 hover:bg-white/10 rounded disabled:opacity-20"><ArrowDown className="w-3 h-3 text-slate-400" /></button>
                                                            {canRemoveAuthor ? (
                                                                <button onClick={() => setLocalAuthors(current => current.filter(authorId => authorId !== id))} className="p-1 hover:bg-red-500/10 rounded text-slate-400 hover:text-red-400">
                                                                    <XCircle className="w-3 h-3" />
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {authorsError && <p className="text-xs text-red-400">{authorsError}</p>}
                                    <div className="flex gap-2 pt-2">
                                        <button onClick={async () => { if (await confirmCancel()) { setLocalAuthors(orderedPaperAuthorIds); setIsEditingAuthors(false); setAuthorsError(''); } }} className="flex-1 py-2 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
                                        <button onClick={handleSaveAuthors} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors">Save</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {(paper.authors?.length ?? 0) > 0 ? (paper.authors ?? []).map((author: any) => {
                                        return (
                                            <div key={author.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                                <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-semibold text-sm border border-blue-500/20 shrink-0">
                                                    {author.name?.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">
                                                        {author.name}
                                                        {author.id === user.id && <span className="ml-2 text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">You</span>}
                                                    </p>
                                                    <p className="text-xs text-slate-500">{author.email}</p>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <p className="text-sm text-slate-500">No authors assigned.</p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* History & Collaborating Labs */}
            <div className="space-y-6 mt-6">
                {canViewHistory && renderPaperHistory()}

                {user.isCoordinator && (
                <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                            <FlaskConical className="w-5 h-5 text-indigo-400" />
                            Collaborating Labs
                        </h2>
                        {!showInviteLabPanel && (
                            <button
                                onClick={() => { setShowInviteLabPanel(true); setInviteError(''); setSelectedInviteLabIds([]); setLabSearchQuery(''); }}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Invite Lab
                            </button>
                        )}
                    </div>

                    {/* Current collaborating labs */}
                    {(paper.labs ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No collaborating labs yet.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {(paper.labs ?? []).map((lab) => (
                                <span key={lab.id} className="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium">
                                    {lab.name}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Invitation history */}
                    {collabInvitations.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-white/5">
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Invitations</h3>
                            {cancelError && <p className="text-xs text-red-400">{cancelError}</p>}
                            {collabInvitations.map(inv => (
                                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <div>
                                        <p className="text-sm font-medium text-white">{inv.invitedLab.name}</p>
                                        <p className="text-xs text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                            inv.status === 'Accepted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            inv.status === 'Rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                            inv.status === 'Cancelled' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                                            'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                        }`}>
                                            {inv.status}
                                        </span>
                                        {inv.status === 'Pending' && (
                                            <button
                                                disabled={cancellingInviteId === inv.id}
                                                onClick={async () => {
                                                    setCancellingInviteId(inv.id);
                                                    setCancelError('');
                                                    try {
                                                        await cancelCollaborationInvitationRequest(inv.id);
                                                        setCollabInvitations(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'Cancelled' as const } : i));
                                                        setAllLabs(prev => [...prev, { id: inv.invitedLab.id, name: inv.invitedLab.name, description: '' }]);
                                                    } catch (e: any) {
                                                        setCancelError(e.message || 'Failed to cancel invitation.');
                                                    } finally {
                                                        setCancellingInviteId(null);
                                                    }
                                                }}
                                                className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                                title="Cancel invitation"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Invite panel */}
                    {showInviteLabPanel && (
                        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
                            <h3 className="text-sm font-semibold text-indigo-400">Invite a Lab to Collaborate</h3>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Search labs..."
                                    value={labSearchQuery}
                                    onChange={e => setLabSearchQuery(e.target.value)}
                                    className="w-full bg-background border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                />
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                {allLabs.filter(l => l.name.toLowerCase().includes(labSearchQuery.toLowerCase())).length === 0 ? (
                                    <p className="text-sm text-slate-500 text-center py-4">No available labs to invite.</p>
                                ) : (
                                    allLabs
                                        .filter(l => l.name.toLowerCase().includes(labSearchQuery.toLowerCase()))
                                        .map(lab => (
                                            <button
                                                key={lab.id}
                                                type="button"
                                                onClick={() => setSelectedInviteLabIds(prev =>
                                                    prev.includes(lab.id) ? prev.filter(id => id !== lab.id) : [...prev, lab.id]
                                                )}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedInviteLabIds.includes(lab.id) ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                            >
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${selectedInviteLabIds.includes(lab.id) ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                                    {lab.name.charAt(0)}
                                                </div>
                                                <p className={`text-sm font-medium truncate ${selectedInviteLabIds.includes(lab.id) ? 'text-indigo-100' : 'text-slate-300'}`}>{lab.name}</p>
                                            </button>
                                        ))
                                )}
                            </div>
                            {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
                            <div className="flex gap-3">
                                <button
                                    onClick={async () => {
                                        if (selectedInviteLabIds.length === 0) return;
                                        setSendingInvites(true);
                                        setInviteError('');
                                        try {
                                            const result = await sendCollaborationInvitationsRequest(params.id, selectedInviteLabIds);
                                            // Refresh invitation list independently — failure here doesn't mean send failed
                                            getPaperInvitationsRequest(params.id)
                                                .then(setCollabInvitations)
                                                .catch(() => {});
                                            const successfulLabIds = new Set(result.invited.map(i => i.invitedLabId));
                                            setAllLabs(prev => prev.filter(l => !successfulLabIds.has(l.id)));
                                            setSelectedInviteLabIds([]);
                                            if (result.errors?.length) {
                                                setInviteError(result.errors.map((e: any) => e.reason).join('; '));
                                            } else {
                                                setShowInviteLabPanel(false);
                                            }
                                        } catch (e: any) {
                                            setInviteError(e.message || 'Failed to send invitations.');
                                        } finally {
                                            setSendingInvites(false);
                                        }
                                    }}
                                    disabled={selectedInviteLabIds.length === 0 || sendingInvites}
                                    className="px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
                                >
                                    {sendingInvites ? 'Sending…' : `Send Invitation${selectedInviteLabIds.length > 1 ? 's' : ''}`}
                                </button>
                                <button
                                    onClick={() => { setShowInviteLabPanel(false); setSelectedInviteLabIds([]); setInviteError(''); }}
                                    className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            </div>{/* end history + collab grid */}

            {/* Rating Modal */}
            {ratingModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="glass rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
                        <button
                            onClick={() => setRatingModalOpen(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                        >
                            <XCircle className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <Star className="w-5 h-5 text-amber-400" />
                            Rate Reviewer
                        </h2>
                        <p className="text-sm text-slate-400 mb-5">
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
                                onClick={() => setRatingModalOpen(false)}
                                className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 transition-colors text-sm font-medium"
                                disabled={submittingRating}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitRating}
                                disabled={submittingRating}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                            >
                                {submittingRating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                {submittingRating ? 'Submitting...' : 'Submit Rating'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
