'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import { MOCK_ROUNDS, MOCK_ASSIGNMENTS, MOCK_USERS } from '@/lib/mockData';
import { ArrowLeft, UserPlus, CheckCircle2, Clock, XCircle, Play, Archive, Edit, ExternalLink, Loader2 } from 'lucide-react';
import { getPaperByIdRequest, updatePaperAbstractRequest, updatePaperTopicsRequest, getTopicsRequest, TopicOption } from '@/lib/api';

export default function PaperDetails({ params }: { params: { id: string } }) {
    const { user } = useUser();
    const [paper, setPaper] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [availableTopics, setAvailableTopics] = useState<TopicOption[]>([]);
    
    const [isArchiving, setIsArchiving] = useState(false);
    const [isStartingRound, setIsStartingRound] = useState(false);
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
    const [isSendingReminder, setIsSendingReminder] = useState(false);
    const [reminderSent, setReminderSent] = useState(false);

    const [localAbstract, setLocalAbstract] = useState('');
    const [localTopics, setLocalTopics] = useState<string[]>([]); // These will be IDs
    const [localDeadline, setLocalDeadline] = useState('');
    const [localHistory, setLocalHistory] = useState<any[]>([]);

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
                setAvailableTopics(topicsData);

                // Set initial deadline from mock data if it matches
                const activeRound = MOCK_ROUNDS.find(r => r.paperId === paperData.id && r.status === 'Open');
                if (activeRound) {
                    setLocalDeadline(activeRound.deadline || '');
                }
                setLocalHistory(paperData.history || []);
            } catch (err) {
                console.error('Failed to fetch paper details', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [params.id]);

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

    const isAuthor = paper.authors?.some((a: any) => a.id === user.id);
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
            backHref = '/papers?filter=reviews';
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

    const handleArchive = () => {
        setIsArchiving(true);
        setTimeout(() => {
            setLocalStatus('Archived');
            setIsArchiving(false);
        }, 800);
    };

    const handleStartRound = () => {
        setIsStartingRound(true);
        setTimeout(() => {
            setLocalStatus('In Review');
            setIsStartingRound(false);
        }, 800);
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

    const handleSubmitReview = () => {
        setIsSubmittingReview(true);
        setTimeout(() => {
            setLocalAssignmentStatus('Submitted');

            // Add to history
            const newEvent = {
                id: `h-new-${Date.now()}`,
                date: new Date().toISOString(),
                message: `${user.name} submitted their review task`,
                actorId: user.id,
                type: 'ReviewAction' as 'StatusChange' | 'ReviewAction' | 'SystemAction'
            };
            setLocalHistory(prev => [...prev, newEvent]);

            setIsSubmittingReview(false);
        }, 800);
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
        try {
            await updatePaperAbstractRequest(paper.id, localAbstract);
            setPaper({ ...paper, abstractText: localAbstract });
            setIsEditingAbstract(false);
        } catch (err) {
            console.error('Failed to update abstract', err);
            alert('Failed to update abstract');
        }
    };

    const handleSaveTopics = async () => {
        try {
            const updatedPaper = await updatePaperTopicsRequest(paper.id, localTopics);
            setPaper({ ...paper, topics: updatedPaper.topics });
            setIsEditingTopics(false);
        } catch (err) {
            console.error('Failed to update topics', err);
            alert('Failed to update topics');
        }
    };

    const toggleTopic = (id: string) => {
        if (localTopics.includes(id)) {
            setLocalTopics(localTopics.filter(t => t !== id));
        } else {
            setLocalTopics([...localTopics, id]);
        }
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
                        {paper.topics?.map((topic: any) => (
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
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => {
                                            setLocalTopics(paper.topics?.map((t: any) => t.id) || []);
                                            setIsEditingTopics(false);
                                        }}
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

                    <div className="flex flex-wrap items-center gap-3">
                        {paper.overleafLink && (
                            <a href={paper.overleafLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 bg-blue-500/10 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/20 w-fit">
                                <ExternalLink className="w-4 h-4" />
                                Open Overleaf Manuscript
                            </a>
                        )}
                    </div>
                </div>

                {/* Action Buttons based on Role & State */}
                <div className="flex flex-col gap-3 shrink-0 lg:min-w-48">
                    {/* Coordinator Draft Actions */}
                    {user.isCoordinator && effectivePaperStatus === 'Draft' && (
                        <Link
                            href={`/papers/${paper.id}/assign?mode=start-round`}
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
                                href={`/papers/${paper.id}/assign`}
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

                    {/* Coordinator General Actions */}
                    {user.isCoordinator && effectivePaperStatus !== 'Archived' && (
                        <>
                            <button className="w-full px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                                <Edit className="w-4 h-4 text-slate-400" />
                                Edit Authors
                            </button>

                            <button
                                onClick={handleArchive}
                                disabled={isArchiving}
                                className="w-full px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Archive className="w-4 h-4" />
                                Archive Paper
                            </button>

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

                        {isEditingAbstract ? (
                            <div className="space-y-3">
                                <textarea
                                    value={localAbstract}
                                    onChange={(e) => setLocalAbstract(e.target.value)}
                                    rows={6}
                                    className="w-full bg-background border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-y"
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => {
                                            setLocalAbstract(paper.abstractText);
                                            setIsEditingAbstract(false);
                                        }}
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

                    {/* Timeline / Status Flow (Restricted) */}
                    {canViewHistory && (
                        <div className="glass p-8 rounded-2xl border border-white/5">
                            <h2 className="text-xl font-semibold text-white mb-6">History & Activity Log</h2>

                            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:h-full before:w-0.5 before:bg-white/10">
                                {localHistory.length === 0 ? (
                                    <p className="text-sm text-slate-500 ml-10 relative">No history recorded yet.</p>
                                ) : (
                                    localHistory.map((event) => {
                                        const dateObj = new Date(event.date);
                                        const IconNode = event.type === 'SystemAction' ? <CheckCircle2 className="w-4 h-4" /> :
                                            event.type === 'ReviewAction' ? <UserPlus className="w-4 h-4" /> :
                                                <Play className="w-4 h-4" />;

                                        const iconColors = event.type === 'SystemAction' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' :
                                            event.type === 'ReviewAction' ? 'bg-purple-500/20 text-purple-400 border-purple-500/20' :
                                                'bg-blue-500/20 text-blue-400 border-blue-500/20';

                                        return (
                                            <div key={event.id} className="relative flex items-start gap-5 group">
                                                <div className="absolute left-4 top-10 w-0.5 h-full bg-white/10 group-last:hidden"></div>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border z-10 ${iconColors}`}>
                                                    {IconNode}
                                                </div>
                                                <div className="flex-1 bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="text-white font-medium text-sm">{event.message}</h4>
                                                        <span className="text-xs text-slate-500 font-mono">
                                                            {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="glass p-6 rounded-2xl border border-white/5">
                        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
                            Authors
                            {user.isCoordinator && (
                                <button className="text-xs text-blue-400 hover:text-blue-300 capitalize flex items-center gap-1">
                                    <Edit className="w-3 h-3" /> Edit
                                </button>
                            )}
                        </h3>
                         <div className="space-y-4">
                            {paper.authors?.length > 0 ? paper.authors.map((author: any) => {
                                return (
                                    <div key={author.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-semibold text-sm border border-blue-500/20 shrink-0">
                                            {author.name?.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-medium">{author.name}</p>
                                            <p className="text-xs text-slate-500">{author.email}</p>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-sm text-slate-500">No authors assigned.</p>
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
