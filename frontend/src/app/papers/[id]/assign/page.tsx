'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import { MOCK_PAPERS, MOCK_USERS } from '@/lib/mockData';
import { ArrowLeft, Search, UserPlus, FileCheck, CalendarIcon, Play } from 'lucide-react';

export default function AssignReviewers({ params }: { params: { id: string } }) {
    const { user } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const mode = searchParams.get('mode');
    const isStartingRound = mode === 'start-round';

    const paper = MOCK_PAPERS.find(p => p.id === params.id);
    const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
    const [deadline, setDeadline] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!paper) return notFound();

    // Protect route
    if (!user.isCoordinator) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
                <p className="text-slate-400">Only the Coordinator can assign reviewers to papers.</p>
                <Link href={`/papers/${params.id}`} className="mt-6 text-blue-400 hover:text-blue-300">
                    Return to Paper
                </Link>
            </div>
        );
    }

    // Get all users who are potential reviewers (non-coordinators)
    const candidateReviewers = Object.values(MOCK_USERS).filter(
        u => !u.isCoordinator && !paper.authors.includes(u.id)
    );

    const toggleReviewer = (id: string) => {
        if (selectedReviewers.includes(id)) {
            setSelectedReviewers(selectedReviewers.filter(r => r !== id));
        } else {
            setSelectedReviewers([...selectedReviewers, id]);
        }
    };

    const handleAssign = () => {
        setIsSubmitting(true);
        // Mock API simulation
        setTimeout(() => {
            setIsSubmitting(false);
            router.push(`/papers/${params.id}?action=success`);
        }, 1000);
    };

    const isReadySubmit = isStartingRound ? (selectedReviewers.length > 0 && deadline !== '') : selectedReviewers.length > 0;

    return (
        <div className="max-w-5xl mx-auto py-4 animate-in fade-in duration-500 mb-20">
            <Link href={`/papers/${paper.id}`} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" />
                Back to Paper Details
            </Link>

            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight">
                    {isStartingRound ? 'Configure & Start Review Round' : 'Assign Reviewers'}
                </h1>
                <p className="text-slate-400 mt-1 flex items-center gap-2">
                    For: <span className="text-slate-200 font-medium">{paper.title}</span>
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">

                    {isStartingRound && (
                        <div className="glass rounded-2xl border border-white/5 overflow-hidden p-6 mb-8">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-blue-400" />
                                Review Deadline
                            </h3>
                            <p className="text-slate-400 text-sm mb-4">Set the requested deadline for the reviewers to complete their evaluations.</p>
                            <input
                                type="date"
                                required
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                                className="w-full max-w-sm bg-background/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
                            />
                        </div>
                    )}

                    <div className="glass rounded-2xl border border-white/5 overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex items-center gap-4 bg-white/[0.02]">
                            <Search className="w-5 h-5 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search candidates by name, email, or topic..."
                                className="w-full bg-transparent border-none text-white focus:outline-none placeholder:text-slate-500"
                            />
                        </div>

                        <div className="divide-y divide-white/5">
                            {candidateReviewers.map(reviewer => {
                                const intersection = paper.topics.filter(t => reviewer.topics?.includes(t));
                                const isSelected = selectedReviewers.includes(reviewer.id);

                                return (
                                    <div key={reviewer.id} className={`p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition-colors ${isSelected ? 'bg-blue-600/5' : 'hover:bg-white/[0.02]'}`}>
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold shrink-0">
                                                {reviewer.name.charAt(0)}
                                            </div>
                                            <div>
                                                <h3 className="text-white font-medium text-lg">{reviewer.name}</h3>
                                                <div className="text-xs text-slate-500 mt-1 mb-3">{reviewer.email}</div>

                                                <div className="bg-white/5 border border-white/10 rounded-lg p-3 inline-block">
                                                    <span className="text-xs font-semibold text-slate-400 block mb-1">SYSTEM RECOMMENDATION</span>
                                                    {intersection.length > 0 ? (
                                                        <p className="text-sm text-emerald-400 flex items-center gap-1.5 break-all">
                                                            <FileCheck className="w-4 h-4 shrink-0" />
                                                            Match: {intersection.join(', ')}
                                                        </p>
                                                    ) : (
                                                        <p className="text-sm text-amber-400">
                                                            Low Match. No direct topic overlap.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => toggleReviewer(reviewer.id)}
                                            className={`shrink-0 w-full sm:w-auto px-4 py-2 mt-4 sm:mt-0 rounded-lg text-sm font-medium transition-colors border ${isSelected
                                                ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50'
                                                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            {isSelected ? 'Selected' : 'Select'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="space-y-6 relative">
                    <div className="glass p-6 rounded-2xl border border-white/5 sticky top-8">
                        <h3 className="text-lg font-bold text-white mb-4">Configuration Summary</h3>

                        {isStartingRound && (
                            <div className="mb-6 pb-6 border-b border-white/5">
                                <div className="text-sm text-slate-400 mb-1">Set Deadline:</div>
                                <div className="text-white font-medium font-mono bg-white/5 px-3 py-2 rounded border border-white/10 inline-block w-full">
                                    {deadline || 'Not set'}
                                </div>
                            </div>
                        )}

                        <div className="mb-6">
                            <div className="flex items-center justify-between text-sm mb-2">
                                <span className="text-slate-400">Selected Reviewers</span>
                                <span className="text-white font-medium">{selectedReviewers.length}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400">Suggested Minimum</span>
                                <span className="text-white font-medium">3</span>
                            </div>
                        </div>

                        <div className="space-y-3 mb-8">
                            {selectedReviewers.length === 0 ? (
                                <div className="text-center py-6 border border-dashed border-white/10 rounded-xl text-slate-500 text-sm">
                                    Select candidates from the list to assign them to this paper.
                                </div>
                            ) : (
                                selectedReviewers.map(id => {
                                    const rev = MOCK_USERS[Object.keys(MOCK_USERS).find(k => MOCK_USERS[k].id === id) as keyof typeof MOCK_USERS];
                                    return (
                                        <div key={id} className="bg-white/5 border border-white/10 rounded-lg p-3 flex justify-between items-center group">
                                            <span className="text-sm text-slate-200">{rev.name}</span>
                                            <button
                                                onClick={() => toggleReviewer(id)}
                                                className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all font-medium text-xs"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <button
                            onClick={handleAssign}
                            disabled={!isReadySubmit || isSubmitting}
                            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                isStartingRound ? <><Play className="w-5 h-5 fill-current" /> Initialize Round</> : <><UserPlus className="w-5 h-5" /> Confirm Assignments</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
