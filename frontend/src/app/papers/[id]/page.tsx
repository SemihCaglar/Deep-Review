'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import { MOCK_ROUNDS, MOCK_ASSIGNMENTS, MOCK_USERS } from '@/lib/mockData';
import { ArrowLeft, UserPlus, CheckCircle2, Clock, XCircle, Play, Archive, Edit, ExternalLink, Loader2, ArrowUp, ArrowDown, Plus, ChevronDown, ChevronUp, Github, Cpu, Download, ShieldCheck } from 'lucide-react';
import {
  getPaperByIdRequest, updatePaperAbstractRequest, updatePaperTopicsRequest,
  getTopicsRequest, getPaperHistoryRequest, TopicOption, Paper, PaperHistory,
  getLabMembersRequest, ApiError, LabMember,
  AuthorRound, getAuthorRoundsRequest, createRoundRequest, editRoundDeadlineRequest,
  getSuggestedReviewersRequest, SuggestedReviewer,
  getProposedReviewersRequest, addProposedReviewerRequest, removeProposedReviewerRequest,
  updateOverleafLinkRequest, updateGithubLinkRequest, updatePaperStatusRequest,
  startAIReviewRequest, runComplianceCheckRequest, getVenueRulesRequest,
} from '@/lib/api';


function todayInputValue() {
    const today = new Date();
    const timezoneOffsetMs = today.getTimezoneOffset() * 60 * 1000;
    return new Date(today.getTime() - timezoneOffsetMs).toISOString().split('T')[0];
}

export default function PaperDetails({ params }: { params: { id: string } }) {
    const { user } = useUser();
    const [paper, setPaper] = useState<Paper | null>(null);
    const [loading, setLoading] = useState(true);
    const [availableTopics, setAvailableTopics] = useState<TopicOption[]>([]);
    
    const [isArchiving, setIsArchiving] = useState(false);
    const [archiveError, setArchiveError] = useState('');
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
    const [isEditingDeadline, setIsEditingDeadline] = useState(false);
    const [isEditingLinks, setIsEditingLinks] = useState(false);
    const [isSendingReminder, setIsSendingReminder] = useState(false);
    const [reminderSent, setReminderSent] = useState(false);
    const [isEditingAuthors, setIsEditingAuthors] = useState(false);
    const [localAuthors, setLocalAuthors] = useState<string[]>([]);
    const [availableUsers, setAvailableUsers] = useState<LabMember[]>([]);

    const [localAbstract, setLocalAbstract] = useState('');
    const [abstractError, setAbstractError] = useState('');
    const [topicsError, setTopicsError] = useState('');
    const [authorsError, setAuthorsError] = useState('');
    const [localTopics, setLocalTopics] = useState<string[]>([]); // These will be IDs
    const [localDeadline, setLocalDeadline] = useState('');
    const [localOverleafLink, setLocalOverleafLink] = useState('');

    const [linksError, setLinksError] = useState('');
    const [savingLinks, setSavingLinks] = useState(false);
    const [paperHistory, setPaperHistory] = useState<PaperHistory | null>(null);
    const [historyError, setHistoryError] = useState('');

    const [runningAI, setRunningAI] = useState<string | null>(null);
    const [runningCompliance, setRunningCompliance] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    
    // Show AI errors to the user
    useEffect(() => {
        if (aiError) {
            window.alert(aiError);
            setAiError(null);
        }
    }, [aiError]);
    const aiFileInputRef = useRef<HTMLInputElement>(null);
    const complianceFileInputRef = useRef<HTMLInputElement>(null);
    const [pendingAIRoundId, setPendingAIRoundId] = useState<string | null>(null);
    const [pendingComplianceRoundId, setPendingComplianceRoundId] = useState<string | null>(null);

    // Author round proposal state
    const [authorRounds, setAuthorRounds] = useState<AuthorRound[]>([]);
    const [loadingRounds, setLoadingRounds] = useState(false);
    const [showCreateRound, setShowCreateRound] = useState(false);
    const [newVenueCat, setNewVenueCat] = useState('Conference');
    const [newTargetVenue, setNewTargetVenue] = useState('');
    const [newSubDeadline, setNewSubDeadline] = useState('');
    const [newRoundDeadline, setNewRoundDeadline] = useState('');
    const [creatingRound, setCreatingRound] = useState(false);
    const [createRoundError, setCreateRoundError] = useState('');
    // Per-round proposal panel state (keyed by round id)
    const [expandedRound, setExpandedRound] = useState<string | null>(null);
    const [proposedMap, setProposedMap] = useState<Record<string, { id: string; name: string; email: string }[]>>({});
    const [suggestionsMap, setSuggestionsMap] = useState<Record<string, SuggestedReviewer[]>>({});
    const [loadingSuggestions, setLoadingSuggestions] = useState<Record<string, boolean>>({});
    const [showSuggestPanel, setShowSuggestPanel] = useState<Record<string, boolean>>({});
    const [roundErrors, setRoundErrors] = useState<Record<string, string>>({});
    const [editingRoundDeadline, setEditingRoundDeadline] = useState<string | null>(null);
    const [roundDeadlineDraft, setRoundDeadlineDraft] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [paperData, topicsData] = await Promise.all([
                    getPaperByIdRequest(params.id),
                    getTopicsRequest()
                ]);
                setPaper(paperData);
                setLocalAbstract(paperData.abstractText || '');
                setLocalTopics(paperData.topics?.map((t: any) => t.id) || []);
                setLocalAuthors(paperData.authors?.map((a: any) => a.id) || []);
                setLocalOverleafLink(paperData.overleafLink || '');
                setAvailableTopics(topicsData);

                // Set initial deadline from mock data if it matches
                const activeRound = MOCK_ROUNDS.find(r => r.paperId === paperData.id && r.status === 'Open');
                if (activeRound) {
                    setLocalDeadline(activeRound.deadline || '');
                }
                
                // Fetch lab members for author editing
                const membersRes = await getLabMembersRequest();
                setAvailableUsers(membersRes.users);

                try {
                    const historyData = await getPaperHistoryRequest(params.id);
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
                setLoading(false);
            }
        };
        fetchData();
    }, [params.id]);

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

    // AI Check
    const allReviewsComplete = assignments.length > 0 && assignments.every(a => a.status === 'Submitted');

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Draft': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
            case 'In Review': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'Review Done': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
            case 'Accepted': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'Archived': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
            default: return 'bg-white/10 text-slate-300 border-white/20';
        }
    };

    const handleArchive = async () => {
        setIsArchiving(true);
        setArchiveError('');
        try {
            const updatedPaper = await updatePaperStatusRequest(paper.id, 'Archived');
            setPaper(updatedPaper);
            setLocalStatus(updatedPaper.status);
        } catch (err) {
            setArchiveError(err instanceof ApiError ? err.message : 'Failed to archive paper.');
        } finally {
            setIsArchiving(false);
        }
    };

    const handleUnarchive = async () => {
        setIsArchiving(true);
        setArchiveError('');
        try {
            const updatedPaper = await updatePaperStatusRequest(paper.id, 'Draft');
            setPaper(updatedPaper);
            setLocalStatus(updatedPaper.status);
        } catch (err) {
            setArchiveError(err instanceof ApiError ? err.message : 'Failed to unarchive paper.');
        } finally {
            setIsArchiving(false);
        }
    };

    // Calculate effective assignment statuses including local mocks
    const getEffectiveAssignmentStatus = (assignmentId: string, reviewerId: string, originalStatus: string) => {
        if (reviewerId === user.id && localAssignmentStatus) {
            return localAssignmentStatus;
        }
        return originalStatus;
    };

    const isRoundComplete = assignments.length > 0 && assignments.every(a =>
        getEffectiveAssignmentStatus(a.id, a.reviewerId, a.status) === 'Submitted'
    );
    const effectivePaperStatus = isRoundComplete && currentStatus === 'In Review' ? 'Review Done' : currentStatus;
    const canEditAuthors = (user.isCoordinator || isAuthor) && effectivePaperStatus !== 'Archived';
    const canEditLinks = (user.isCoordinator || isAuthor) && effectivePaperStatus !== 'Archived';
    const canChangeArchiveState = user.isCoordinator || isAuthor;
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

    const handleSendReminder = () => {
        setIsSendingReminder(true);
        setTimeout(() => {
            setIsSendingReminder(false);
            setReminderSent(true);
            setTimeout(() => setReminderSent(false), 3000);
        }, 800);
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
        setCreatingRound(true);
        setCreateRoundError('');
        try {
            await createRoundRequest(
                params.id, newTargetVenue, newVenueCat,
                newVenueCat === 'Conference' ? newSubDeadline : undefined,
                newRoundDeadline || undefined,
            );
            setShowCreateRound(false);
            setNewTargetVenue('');
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
            await editRoundDeadlineRequest(roundId, new Date(roundDeadlineDraft).toISOString());
            setEditingRoundDeadline(null);
            await refreshRounds();
        } catch (e) {
            setRoundErrors(prev => ({ ...prev, [roundId]: e instanceof ApiError ? e.message : 'Failed to save deadline' }));
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

    const handleStartAIReview = (roundId: string) => {
        setPendingAIRoundId(roundId);
        aiFileInputRef.current?.click();
    };

    const handleAIFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !pendingAIRoundId) return;
        e.target.value = '';
        setRunningAI(pendingAIRoundId);
        setAiError('');
        try {
            await startAIReviewRequest(pendingAIRoundId, file);
            const historyData = await getPaperHistoryRequest(params.id);
            setPaperHistory(historyData);
        } catch (err: any) {
            setAiError(err.message || 'Failed to start AI Review');
        } finally {
            setRunningAI(null);
            setPendingAIRoundId(null);
        }
    };

    const handleRunComplianceCheck = (roundId: string, _targetVenue: string) => {
        setPendingComplianceRoundId(roundId);
        complianceFileInputRef.current?.click();
    };

    const handleComplianceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !pendingComplianceRoundId) return;
        e.target.value = '';
        setRunningCompliance(pendingComplianceRoundId);
        setAiError('');
        try {
            // Optionally fetch venue rules first
            let venueRules = {};
            try { venueRules = await getVenueRulesRequest(pendingComplianceRoundId); } catch {}
            await runComplianceCheckRequest(pendingComplianceRoundId, file, venueRules);
            const historyData = await getPaperHistoryRequest(params.id);
            setPaperHistory(historyData);
        } catch (err: any) {
            setAiError(err.message || 'Failed to run Compliance Check');
        } finally {
            setRunningCompliance(null);
            setPendingComplianceRoundId(null);
        }
    };

    const renderPaperHistory = () => {
        const isAuthor = paperHistory?.authors?.some(a => a.id === user.id) || paper.authors?.some(a => a.id === user.id);
        const isCoordinator = user.isCoordinator;

        return (
            <div className="glass p-8 rounded-2xl border border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
                <div>
                    <h2 className="text-xl font-semibold text-white">History & Activity Log</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        {paperHistory?.title || paper.title} · {paperHistory?.targetVenue || paper.targetVenue}
                    </p>
                </div>
                <span className={`w-fit px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wider ${getStatusColor(paperHistory?.status || effectivePaperStatus)}`}>
                    {paperHistory?.status || effectivePaperStatus}
                </span>
            </div>

            {historyError && !paperHistory ? (
                <p className="text-sm text-slate-500">{historyError}</p>
            ) : !paperHistory?.rounds?.length ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-sm text-slate-500">No review rounds recorded yet.</p>
                    {(paperHistory?.overleafLink || paper.overleafLink) && (
                        <a
                            href={(paperHistory?.overleafLink || paper.overleafLink) ?? ''}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Open Overleaf Manuscript
                        </a>
                    )}
                </div>
            ) : (
                <div className="space-y-5">
                    {(paperHistory.overleafLink || paper.overleafLink) && (
                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                            <a
                                href={(paperHistory.overleafLink || paper.overleafLink) ?? ''}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Overleaf manuscript
                            </a>
                        </div>
                    )}

                    {paperHistory.rounds.map(round => {
                        const checklistItems = round.artifacts?.checklistItems || [];
                        const aiReports = round.artifacts?.aiReviewReports || [];

                        return (
                            <section key={round.id || round.roundNumber} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                                <div className="p-5 border-b border-white/5">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-white font-semibold">Round {round.roundNumber}</h3>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Started: {formatDateTime(round.startedAt)} · Completed: {formatDateTime(round.completedAt)}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className="px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-slate-300">
                                                Deadline: {formatDate(round.deadline)}
                                            </span>
                                            {round.roundStatus === 'Completed' && (isAuthor || isCoordinator) && (
                                                <div className="flex gap-2 ml-2">
                                                    <button
                                                        onClick={() => handleStartAIReview(round.id)}
                                                        disabled={runningAI === round.id}
                                                        className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-full transition-colors flex items-center gap-1.5"
                                                        title="Run AI Post-Review Analysis (Requires PDF Upload)"
                                                    >
                                                        {runningAI === round.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                                                        AI Review
                                                    </button>
                                                    <button
                                                        onClick={() => handleRunComplianceCheck(round.id, paperHistory?.targetVenue || paper.targetVenue || '')}
                                                        disabled={runningCompliance === round.id}
                                                        className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-full transition-colors flex items-center gap-1.5"
                                                        title="Run Venue Compliance Check (Requires PDF Upload)"
                                                    >
                                                        {runningCompliance === round.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                                                        Compliance
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="divide-y divide-white/5">
                                    {round.assignments.length === 0 ? (
                                        <p className="p-5 text-sm text-slate-500">No reviewers assigned in this round.</p>
                                    ) : round.assignments.map(assignment => (
                                        <div key={assignment.assignmentId} className="p-5">
                                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-white">
                                                        {assignment.reviewerName || 'Unassigned reviewer'}
                                                    </p>
                                                    {assignment.reviewerEmail && (
                                                        <p className="text-xs text-slate-500 mt-0.5">{assignment.reviewerEmail}</p>
                                                    )}
                                                </div>
                                                <span className={`w-fit px-2.5 py-1 rounded-full text-xs font-medium border ${getAssignmentStatusColor(assignment.status)}`}>
                                                    {assignment.status}
                                                </span>
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
                                                <span>Invited: {formatDateTime(assignment.invitedAt)}</span>
                                                <span>Accepted: {formatDateTime(assignment.acceptedAt)}</span>
                                                <span>Submitted: {formatDateTime(assignment.submittedAt)}</span>
                                                <span>Assignment deadline: {formatDate(assignment.deadline)}</span>
                                            </div>

                                            {assignment.declineReason && (
                                                <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                                    <p className="text-xs font-semibold text-red-300">Decline reason</p>
                                                    <p className="text-sm text-slate-300 mt-1">{assignment.declineReason}</p>
                                                </div>
                                            )}

                                            {assignment.declineRequests.length > 0 && (
                                                <div className="mt-4 space-y-2">
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

                                            {assignment.extensions.length > 0 && (
                                                <div className="mt-4 space-y-2">
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
                                    ))}
                                </div>
                                {(checklistItems.length > 0 || aiReports.length > 0 || round.aiReviewReport || round.complianceReport || round.annotatedPdfUrl) && (
                                    <div className="p-6 border-t border-white/5 bg-black/20">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Cpu className="w-3 h-3" />
                                            AI-Generated Artifacts & Reports
                                        </h4>
                                        
                                        <div className="space-y-6">
                                            {/* Legacy Reports (if any) */}
                                            {aiReports.map(report => (
                                                <div key={report.id} className="flex flex-wrap items-center gap-3 text-sm">
                                                    {report.generatedReportUrl && (
                                                        <a href={report.generatedReportUrl} target="_blank" rel="noreferrer" className="glass px-3 py-1.5 rounded-lg inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-all border-white/5">
                                                            <ExternalLink className="w-4 h-4" />
                                                            Legacy AI report
                                                        </a>
                                                    )}
                                                </div>
                                            ))}

                                            {/* New PDF-based AI Review Report */}
                                            {round.aiReviewReport && (
                                                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                                    <div className="glass p-5 rounded-xl border border-indigo-500/10 bg-indigo-500/[0.02]">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded uppercase">AI Review Report</span>
                                                                <span className="text-sm font-semibold text-white">Detected Type: {round.aiReviewReport.paperType}</span>
                                                            </div>
                                                            {round.annotatedPdfUrl && (
                                                                <a href={round.annotatedPdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium">
                                                                    <Download className="w-3.5 h-3.5" />
                                                                    Download Annotated PDF
                                                                </a>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap italic opacity-90 border-l-2 border-indigo-500/30 pl-4 py-1">
                                                            {round.aiReviewReport.summaryReport}
                                                        </div>
                                                        
                                                        {round.aiReviewReport.suggestedCitations && round.aiReviewReport.suggestedCitations.length > 0 && (
                                                            <div className="mt-4 pt-4 border-t border-white/5">
                                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Verified Suggested Citations</p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {round.aiReviewReport.suggestedCitations.map((cit: any, i: number) => (
                                                                        <div key={i} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-slate-400">
                                                                            {cit.title} ({cit.authors?.[0]})
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* New Compliance Report */}
                                            {round.complianceReport && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-4 duration-500 delay-150">
                                                    {Object.entries(round.complianceReport).map(([key, val]: [string, any]) => {
                                                        if (typeof val !== 'object' || val === null) return null;
                                                        const isOk = val.isCompliant;
                                                        return (
                                                            <div key={key} className={`glass p-4 rounded-xl border transition-all ${isOk ? 'border-emerald-500/10 bg-emerald-500/[0.02]' : 'border-red-500/10 bg-red-500/[0.02]'}`}>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                                                    {isOk ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                                                                </div>
                                                                <p className="text-xs text-slate-300 leading-snug">{val.details}</p>
                                                                <div className="mt-2 w-full bg-white/5 h-1 rounded-full overflow-hidden">
                                                                    <div 
                                                                        className={`h-full transition-all duration-1000 ${isOk ? 'bg-emerald-500' : 'bg-red-500'}`} 
                                                                        style={{ width: `${(val.confidence || 0.5) * 100}%` }} 
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Checklist Display */}
                                            {((round.aiReviewReport?.checklist && round.aiReviewReport.checklist.length > 0) || checklistItems.length > 0) && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {(round.aiReviewReport?.checklist?.map((item: any) => ({
                                                        id: item.id,
                                                        description: item.question,
                                                        isChecked: item.answer === true
                                                    })) || checklistItems).map((item: any) => (
                                                        <div key={item.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:bg-white/[0.05]">
                                                            <div className={`mt-0.5 p-1 rounded-md ${item.isChecked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                                            </div>
                                                            <span className="text-sm text-slate-300 leading-tight">{item.description}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto py-4 animate-in fade-in duration-500 mb-20">
            {/* Hidden file inputs for PDF uploads */}
            <input ref={aiFileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleAIFileSelected} />
            <input ref={complianceFileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleComplianceFileSelected} />

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
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {availableTopics.map(topic => (
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
                                        onClick={() => { setLocalTopics(paper.topics?.map(t => t.id) || []); setTopicsError(''); setIsEditingTopics(false); }}
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

                    {activeRound && (
                        <div className="flex items-center gap-2 mb-6 text-sm group/deadline relative w-fit">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-300">
                                Review Deadline: <span className="text-white font-medium">{new Date(localDeadline).toLocaleDateString()}</span>
                            </span>
                            {user.isCoordinator && !isEditingDeadline && (
                                <button
                                    onClick={() => setIsEditingDeadline(true)}
                                    className="opacity-0 group-hover/deadline:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 ml-2"
                                >
                                    <Edit className="w-3 h-3" /> Edit
                                </button>
                            )}
                            {isEditingDeadline && (
                                <div className="absolute left-0 top-10 mt-2 bg-slate-900 border border-white/10 rounded-lg p-3 shadow-xl z-20 flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={localDeadline}
                                        onChange={(e) => setLocalDeadline(e.target.value)}
                                        min={todayInputValue()}
                                        className="bg-background border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    />
                                    <button
                                        onClick={() => setIsEditingDeadline(false)}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                                    >
                                        Save
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            {paper.overleafLink ? (
                                <a href={paper.overleafLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 bg-blue-500/10 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/20 w-fit">
                                    <ExternalLink className="w-4 h-4" />
                                    Open Overleaf Manuscript
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
                                        onClick={() => {
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
                        <>
                            <Link
                                href={`/rounds?paper=${paper.id}`}
                                className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                            >
                                <UserPlus className="w-4 h-4" />
                                Assign Reviewers
                            </Link>

                            <button
                                onClick={handleSendReminder}
                                disabled={isSendingReminder || reminderSent || assignments.length === 0}
                                className={`w-full px-5 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 border 
                                        ${reminderSent
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                        : assignments.length === 0 ? 'bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/20'
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
                        </>
                    )}

                    {canChangeArchiveState && (
                        <>
                            {effectivePaperStatus === 'Archived' ? (
                                <button
                                    onClick={handleUnarchive}
                                    disabled={isArchiving}
                                    className="w-full px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Archive className="w-4 h-4" />
                                    Unarchive Paper
                                </button>
                            ) : (
                                <button
                                    onClick={handleArchive}
                                    disabled={isArchiving}
                                    className="w-full px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Archive className="w-4 h-4" />
                                    Archive Paper
                                </button>
                            )}
                            {archiveError && (
                                <p className="text-xs text-red-400 leading-relaxed">{archiveError}</p>
                            )}
                        </>
                    )}

                    {/* Coordinator General Actions */}
                    {user.isCoordinator && effectivePaperStatus !== 'Archived' && (
                        <>
                            <button
                                disabled={!allReviewsComplete}
                                className={`w-full px-5 py-2.5 border text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 
                                ${allReviewsComplete ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed'}`}
                            >
                                <Play className="w-4 h-4" />
                                Run AI Analysis
                            </button>
                        </>
                    )}

                    {/* Reviewer Actions */}
                    {!user.isCoordinator && (effectivePaperStatus === 'In Review' || effectivePaperStatus === 'Review Done') && myAssignment?.status === 'Pending' && !showDeclineForm && (
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
                    {!user.isCoordinator && (effectivePaperStatus === 'In Review' || effectivePaperStatus === 'Review Done') && myAssignment?.status === 'Pending' && showDeclineForm && (
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
                                <button onClick={() => setShowDeclineForm(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
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

                    {!user.isCoordinator && (effectivePaperStatus === 'In Review' || effectivePaperStatus === 'Review Done') && myAssignment?.status === 'Accepted' && localAssignmentStatus !== 'Submitted' && (
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
                                        <button onClick={() => setShowExtensionForm(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
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
                                        onClick={() => { setLocalAbstract(paper.abstractText || ''); setAbstractError(''); setIsEditingAbstract(false); }}
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

                    {/* Author / coordinator round proposal section */}
                    {(isAuthor || user.isCoordinator) && (
                        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <h2 className="text-xl font-semibold text-white">Review Round Proposals</h2>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {user.isCoordinator && (
                                        <Link
                                            href={`/rounds?paper=${paper.id}`}
                                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            Open Round Overview
                                        </Link>
                                    )}
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
                                            disabled={creatingRound || !newTargetVenue || (newVenueCat === 'Conference' && !newSubDeadline)}
                                            className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors">
                                            {creatingRound ? 'Creating…' : 'Create Draft'}
                                        </button>
                                        <button onClick={() => setShowCreateRound(false)}
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

                                return (
                                    <div key={round.id} className="rounded-xl border border-white/10 overflow-hidden">
                                        <button
                                            onClick={() => setExpandedRound(isExpanded ? null : round.id)}
                                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold">
                                                    {round.roundNumber}
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-sm font-medium text-white">Round {round.roundNumber} — {round.targetVenue}</p>
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
                                                {/* Config */}
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    {round.venueCategory === 'Conference' && (
                                                        <div>
                                                            <p className="text-xs text-slate-500 mb-0.5">Submission Deadline</p>
                                                            <p className="text-white">{round.submissionDeadline ? new Date(round.submissionDeadline).toLocaleDateString() : '—'}</p>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-xs text-slate-500 mb-0.5">Round Deadline</p>
                                                        {round.status === 'Draft' && editingRoundDeadline === round.id ? (
                                                            <div className="flex items-center gap-2">
                                                                <input type="date" value={roundDeadlineDraft} onChange={e => setRoundDeadlineDraft(e.target.value)}
                                                                    min={todayInputValue()}
                                                                    max={round.submissionDeadline ? new Date(round.submissionDeadline).toISOString().split('T')[0] : undefined}
                                                                    className="bg-background border border-white/10 rounded px-2 py-0.5 text-xs text-white" />
                                                                <button onClick={() => handleSaveRoundDeadline(round.id)} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded text-white">Save</button>
                                                                <button onClick={() => setEditingRoundDeadline(null)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-white">{round.deadline ? new Date(round.deadline).toLocaleDateString() : '—'}</p>
                                                                {round.status === 'Draft' && (
                                                                    <button onClick={() => { setEditingRoundDeadline(round.id); setRoundDeadlineDraft(round.deadline ? new Date(round.deadline).toISOString().split('T')[0] : ''); }}
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
                                                                            <p className="text-sm text-white truncate">{r.name}</p>
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
                                                                                        <p className="text-sm text-white truncate">{s.user.name}</p>
                                                                                        <p className="text-xs text-slate-500 truncate">{s.user.email}</p>
                                                                                        {s.reasons[0]?.startsWith('Warning') && (
                                                                                            <p className="text-xs text-amber-400 mt-0.5">{s.reasons[0]}</p>
                                                                                        )}
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

                                                {round.status === 'Open' && (
                                                    <p className="text-xs text-emerald-400">Round is open — reviewers have been assigned and invited by the coordinator.</p>
                                                )}
                                                {round.status === 'Completed' && (
                                                    <p className="text-xs text-slate-400">This round has been completed.</p>
                                                )}

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

                    {canViewHistory && renderPaperHistory()}
                </div>

                <div className="space-y-6">
                    <div className="glass p-6 rounded-2xl border border-white/5">
                        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
                            Authors
                            {canEditAuthors && (
                                <button onClick={() => { setLocalAuthors(paper.authors?.map(author => author.id) ?? []); setIsEditingAuthors(true); }} className="text-xs text-blue-400 hover:text-blue-300 capitalize flex items-center gap-1">
                                    <Edit className="w-3 h-3" /> Edit
                                </button>
                            )}
                        </h3>
                         <div className="space-y-4">
                            {isEditingAuthors ? (
                                <div className="space-y-6">
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                        {addableAuthorOptions.length === 0 ? (
                                            <p className="text-xs text-slate-500 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                                No eligible lab members available to add.
                                            </p>
                                        ) : addableAuthorOptions.map(u => (
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
                                            </button>
                                        ))}
                                    </div>
                                    
                                    <div className="pt-4 border-t border-white/10 space-y-2">
                                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Order</h4>
                                        {localAuthors.map((id, index) => {
                                            const u = availableUsers.find(user => user.id === id);
                                            if (!u) return null;
                                            return (
                                                <div key={id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                                                    <span className="text-xs text-blue-400 font-mono w-4">{index + 1}</span>
                                                    <span className="text-xs text-white truncate flex-1 px-2">{u.name}</span>
                                                    <div className="flex gap-1">
                                                        <button disabled={index === 0} onClick={() => moveAuthor(index, 'up')} className="p-1 hover:bg-white/10 rounded disabled:opacity-20"><ArrowUp className="w-3 h-3 text-slate-400" /></button>
                                                        <button disabled={index === localAuthors.length - 1} onClick={() => moveAuthor(index, 'down')} className="p-1 hover:bg-white/10 rounded disabled:opacity-20"><ArrowDown className="w-3 h-3 text-slate-400" /></button>
                                                        <button onClick={() => setLocalAuthors(current => current.filter(authorId => authorId !== id))} className="p-1 hover:bg-red-500/10 rounded text-slate-400 hover:text-red-400">
                                                            <XCircle className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {authorsError && <p className="text-xs text-red-400">{authorsError}</p>}
                                    <div className="flex gap-2 pt-2">
                                        <button onClick={() => { setLocalAuthors(paper.authors?.map(author => author.id) ?? []); setIsEditingAuthors(false); setAuthorsError(''); }} className="flex-1 py-2 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
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

                    {user.isCoordinator && currentStatus === 'In Review' && (
                        <div className="glass p-6 rounded-2xl border border-white/5">
                            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Round 1 Reviewers</h3>
                            <div className="space-y-4">
                                {assignments.map(a => {
                                    const reviewerInfo = Object.values(MOCK_USERS).find(u => u.id === a.reviewerId);
                                    if (!reviewerInfo) return null;

                                    const isMe = a.reviewerId === user.id;
                                    const displayedStatus = isMe && localAssignmentStatus ? localAssignmentStatus : a.status;

                                    return (
                                        <div key={a.id} className="flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center font-semibold text-xs shrink-0">
                                                    {reviewerInfo.name.charAt(0)}
                                                </div>
                                                <p className="text-white text-sm font-medium">{reviewerInfo.name}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs px-2 py-1 flex items-center rounded ${displayedStatus === 'Accepted' ? 'bg-blue-500/10 text-blue-400' :
                                                        displayedStatus === 'Submitted' ? 'bg-emerald-500/10 text-emerald-400' :
                                                            displayedStatus === 'Declined' ? 'bg-red-500/10 text-red-400' :
                                                                'bg-amber-500/10 text-amber-400'
                                                        }`}>
                                                        {displayedStatus}
                                                    </span>
                                                </div>

                                                {/* Coordinator Extension Approval Actions */}
                                                {hasRequestedExtension[a.id] && !extensionStatus[a.id] && (
                                                    <div className="flex items-center gap-1 mt-1 bg-amber-500/10 border border-amber-500/20 px-2 py-1.5 rounded-lg">
                                                        <Clock className="w-3 h-3 text-amber-400 mr-1" />
                                                        <span className="text-xs text-amber-400 font-medium mr-2">Extension Requested</span>
                                                        <button
                                                            onClick={() => setExtensionStatus(prev => ({ ...prev, [a.id]: 'Approved' }))}
                                                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase rounded transition-colors"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => setExtensionStatus(prev => ({ ...prev, [a.id]: 'Rejected' }))}
                                                            className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold uppercase rounded transition-colors"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                )}

                                                {extensionStatus[a.id] === 'Approved' && (
                                                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mt-1">
                                                        <CheckCircle2 className="w-3 h-3" /> Extension Approved
                                                    </span>
                                                )}

                                                {extensionStatus[a.id] === 'Rejected' && (
                                                    <span className="text-[10px] text-red-400 font-medium flex items-center gap-1 mt-1">
                                                        <XCircle className="w-3 h-3" /> Extension Rejected
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {assignments.length === 0 && <p className="text-slate-500 text-sm">No reviewers assigned yet.</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}
