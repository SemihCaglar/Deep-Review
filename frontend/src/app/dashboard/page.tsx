'use client';

import React, { useEffect, useState } from 'react';
import { useUser } from '@/components/context/UserContext';
import { FileText, CheckCircle, Clock } from 'lucide-react';

export default function Dashboard() {
    const { user, login } = useUser();
    const [papers, setPapers] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);

    useEffect(() => {
        // Fetch real data from our DB using relative proxy
        fetch('/api/papers/all')
            .then(res => res.json())
            .then(data => setPapers(data || []))
            .catch(console.error);
        
        fetch(`/api/search/reviews/reviewer/all`)
            .then(res => res.json())
            .then(data => setAssignments(data || []))
            .catch(console.error);
            
    }, []);

    const myPapers = papers.filter(p => p.authors && p.authors.includes(user.id));
    const myReviews = assignments.filter(a => a.reviewerId === user.id);

    const getStats = () => {
        const stats = [];

        // Personal Stats (Everyone)
        if (myPapers.length > 0 || !user.isCoordinator) {
            stats.push({ label: 'My Submissions', value: myPapers.length, icon: FileText, color: 'text-purple-400', bg: 'bg-purple-500/10' });
            stats.push({ label: 'In Review', value: myPapers.filter(p => p.status === 'HumanReview' || p.status === 'AIReview').length, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' });
        }

        if (myReviews.length > 0 || !user.isCoordinator) {
            stats.push({ label: 'Pending Invitations', value: myReviews.filter(a => a.status === 'Invited').length, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' });
            stats.push({ label: 'Accepted to Review', value: myReviews.filter(a => a.status === 'Accepted').length, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' });
        }

        // System Stats (Coordinator Only)
        if (user.isCoordinator) {
            stats.push({ label: 'Total Papers (System)', value: papers.length, icon: FileText, color: 'text-white', bg: 'bg-white/10' });
            stats.push({ label: 'Total Pending Reviews', value: assignments.filter(a => a.status === 'Invited').length, icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' });
        }

        return stats;
    };

    const stats = getStats();

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Welcome, {user.name}</h1>
                <p className="text-slate-400 mt-2">Here is what&apos;s happening in your BILSEN Dashboard today.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stats.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <div key={i} className="glass p-6 rounded-2xl border border-white/5 flex items-center gap-5 hover:bg-white/5 transition-colors">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${stat.bg}`}>
                                <Icon className={`w-7 h-7 ${stat.color}`} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-400">{stat.label}</p>
                                <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-10 glass rounded-2xl border border-white/5 p-8">
                <h2 className="text-xl font-semibold text-white mb-6">Recent Activity</h2>
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">

                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full border border-slate-700 bg-background text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xs">
                            01
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2rem)] glass p-4 rounded-xl border border-white/5">
                            <div className="flex items-center justify-between space-x-2 mb-1">
                                <div className="font-bold text-slate-200">System Record Updated</div>
                                <time className="font-medium text-blue-400 text-xs text-right">Just now</time>
                            </div>
                            <div className="text-slate-400 text-sm">A new mock paper has been added to the system database.</div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Reviewer Leaderboard / Performance metrics */}
            <div className="mt-8 glass rounded-2xl border border-white/5 p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                <div className="flex items-start justify-between mb-8 relative z-10">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Reviewer Performance {user.isCoordinator ? 'Leaderboard' : ''}</h2>
                        <p className="text-sm text-slate-400 mt-1">
                            {user.isCoordinator
                                ? 'Track top performing reviewers across the system.'
                                : 'See how you compare against your peers this semester.'}
                        </p>
                    </div>
                    {!user.isCoordinator && (
                        <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-slate-300">
                            Current Rank: <span className="text-blue-400 font-bold ml-1">#2</span>
                        </div>
                    )}
                </div>

                {!user.isCoordinator && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative z-10">
                        <div className="bg-background/50 border border-white/10 rounded-xl p-5 border-t-2 border-t-emerald-500">
                            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Average Rating</h3>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-bold text-white">4.8</span>
                                <span className="text-sm text-slate-400 mb-1">/ 5.0</span>
                            </div>
                            <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">↑ Top 10% of reviewers</p>
                        </div>
                        <div className="bg-background/50 border border-white/10 rounded-xl p-5 border-t-2 border-t-blue-500">
                            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Avg. Turnaround</h3>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-bold text-white">4.2</span>
                                <span className="text-sm text-slate-400 mb-1">Days</span>
                            </div>
                            <p className="text-xs text-blue-400 mt-2 flex items-center gap-1">Fast delivery time</p>
                        </div>
                        <div className="bg-background/50 border border-white/10 rounded-xl p-5 border-t-2 border-t-red-500">
                            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Missing/Late Reviews</h3>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-bold text-white">0</span>
                                <span className="text-sm text-slate-400 mb-1">Reviews</span>
                            </div>
                            <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">Perfect completion rate</p>
                        </div>
                    </div>
                )}

                {/* Faux Leaderboard list */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden relative z-10">
                    <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-black/20">
                        <div className="col-span-1 text-center">Rank</div>
                        <div className="col-span-4">Reviewer</div>
                        <div className="col-span-2 text-center">Rating (Avg)</div>
                        <div className="col-span-3 text-center">Completed</div>
                        <div className="col-span-2 text-center">Missing</div>
                    </div>

                    <div className="flex flex-col">
                        <div className="grid grid-cols-12 gap-4 p-4 items-center border-b border-white/5 hover:bg-white/5 transition-colors">
                            <div className="col-span-1 text-center font-bold text-amber-400">1</div>
                            <div className="col-span-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">E</div>
                                <span className="text-sm font-medium text-slate-200">Emily Chen</span>
                            </div>
                            <div className="col-span-2 text-center font-mono text-sm text-white">4.92</div>
                            <div className="col-span-3 text-center text-sm text-slate-300">12</div>
                            <div className="col-span-2 text-center text-sm text-emerald-400">0</div>
                        </div>

                        <div className={`grid grid-cols-12 gap-4 p-4 items-center border-b transition-colors ${!user.isCoordinator ? 'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' : 'border-white/5 hover:bg-white/5'}`}>
                            <div className={`col-span-1 text-center font-bold ${!user.isCoordinator ? 'text-slate-300' : 'text-slate-400'}`}>2</div>
                            <div className="col-span-4 flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${!user.isCoordinator ? 'bg-blue-600 border border-blue-400 text-white' : 'bg-slate-800 text-slate-300'}`}>
                                    {(!user.isCoordinator ? user.name.charAt(0) : 'A')}
                                </div>
                                <span className={`text-sm font-bold ${!user.isCoordinator ? 'text-white' : 'text-slate-200 font-medium'}`}>
                                    {(!user.isCoordinator ? `${user.name} (You)` : 'Semih User')}
                                </span>
                            </div>
                            <div className={`col-span-2 text-center font-mono text-sm ${!user.isCoordinator ? 'text-blue-100' : 'text-white'}`}>4.80</div>
                            <div className={`col-span-3 text-center text-sm ${!user.isCoordinator ? 'text-blue-200' : 'text-slate-300'}`}>8</div>
                            <div className="col-span-2 text-center text-sm text-emerald-400">0</div>
                        </div>

                        <div className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/5 transition-colors">
                            <div className="col-span-1 text-center font-bold text-orange-400">3</div>
                            <div className="col-span-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">J</div>
                                <span className="text-sm font-medium text-slate-200">James Wilson</span>
                            </div>
                            <div className="col-span-2 text-center font-mono text-sm text-white">4.50</div>
                            <div className="col-span-3 text-center text-sm text-slate-300">15</div>
                            <div className="col-span-2 text-center text-sm text-red-400 font-medium">1</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
