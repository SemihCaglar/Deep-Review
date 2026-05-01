'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import { ChevronRight, FileText, Search, Loader2, Clock, CheckCircle2, X } from 'lucide-react';
import { AuthoredPaper, getAllPapersRequest, getMyWrittenPapersRequest, PaperAuthor, TopicOption, Paper } from '@/lib/api';

export default function PapersList() {
    const { user } = useUser();
    const searchParams = useSearchParams();
    const router = useRouter();
    const filter = searchParams.get('filter');

    useEffect(() => {
        if (user.id && !user.isCoordinator && filter !== 'authored') {
            router.replace('/papers?filter=authored');
        }
    }, [user.id, user.isCoordinator, filter, router]);

    const [allPapers, setAllPapers] = useState<(Paper | AuthoredPaper)[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [authorFilter, setAuthorFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    useEffect(() => {
        if (!user.id) {
            setLoading(false);
            setAllPapers([]);
            return;
        }
        const fetchPapers = async () => {
            setLoading(true);
            try {
                const data = filter === 'authored'
                    ? await getMyWrittenPapersRequest()
                    : await getAllPapersRequest();
                setAllPapers(data);
            } catch (err) {
                console.error('Failed to fetch papers:', err);
                setAllPapers([]);
            } finally {
                setLoading(false);
            }
        };
        fetchPapers();
    }, [filter, user.id]);

    const currentUserId = String(user.id || '');
    const isAuthoredByCurrentUser = (paper: Paper | AuthoredPaper) =>
        Boolean(currentUserId && paper.authors?.some((author: PaperAuthor) => author.id === currentUserId));
    const getAuthorName = (author: PaperAuthor) => author.name;
    const getPaperAbstract = (paper: Paper | AuthoredPaper) =>
        paper.abstractText || paper.abstract || '';

    const getPapers = () => {
        if (filter === 'authored') {
            return allPapers.filter(isAuthoredByCurrentUser);
        }
        // Default system view (only accessible via sidebar if Coordinator)
        return allPapers;
    };

    const getTitle = () => {
        if (filter === 'authored') return 'My Authored Papers';
        return 'System Papers';
    };

    const getSubtitle = () => {
        if (filter === 'authored') return 'Manage your submitted manuscripts.';
        return 'Manage and assign papers across the system.';
    };

    const papers = getPapers().filter(p => {
        const q = searchQuery.trim().toLowerCase();
        if (q && !p.title.toLowerCase().includes(q)) return false;
        if (authorFilter.trim()) {
            const af = authorFilter.trim().toLowerCase();
            const hasAuthor = p.authors?.some(a => a.name.toLowerCase().includes(af));
            if (!hasAuthor) return false;
        }
        if (statusFilter && p.status !== statusFilter) return false;
        return true;
    });

    const hasActiveFilters = searchQuery.trim() || authorFilter.trim() || statusFilter;
    const clearFilters = () => { setSearchQuery(''); setAuthorFilter(''); setStatusFilter(''); };

    const STATUSES = ['Draft', 'In Review', 'HumanReview', 'AIReview', 'Completed', 'Accepted', 'Archived'];

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Draft': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
            case 'In Review': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'HumanReview': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'AIReview': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
            case 'Completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'Accepted': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'Archived': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
            default: return 'bg-white/10 text-slate-300 border-white/20';
        }
    };

    const formatDate = (value?: string | null) => {
        if (!value) return 'No deadline';
        return new Date(value).toLocaleDateString();
    };

    const getTopicLabel = (topic: TopicOption | string) => typeof topic === 'string' ? topic : topic.name;
    const getTopicKey = (topic: TopicOption | string) => typeof topic === 'string' ? topic : topic.id;

    return (
        <div className="max-w-6xl mx-auto py-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        {getTitle()}
                    </h1>
                    <p className="text-slate-400 mt-1">
                        {getSubtitle()}
                    </p>
                </div>
                {(user.isCoordinator || user.id) && (!filter || filter === 'all' || filter === 'authored') && (
                    <Link href="/register" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20">
                        Register Academic Paper
                    </Link>
                )}
            </div>

            <div className="glass rounded-2xl border border-white/5 overflow-hidden shadow-xl">
                <div className="p-4 border-b border-white/5 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-48">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by title..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-800 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                        />
                    </div>
                    <div className="relative min-w-44">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Filter by author..."
                            value={authorFilter}
                            onChange={e => setAuthorFilter(e.target.value)}
                            className="w-full bg-slate-800 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                    >
                        <option value="">All statuses</option>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg hover:border-white/20 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" /> Clear
                        </button>
                    )}
                    <span className="text-xs text-slate-500 ml-auto">{papers.length} paper{papers.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="divide-y divide-white/5">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                            <p className="text-slate-400 animate-pulse">Fetching papers...</p>
                        </div>
                    ) : (
                        <>
                            {papers.map((paper) => (
                                <Link
                                    key={paper.id}
                                    href={`/papers/${paper.id}`}
                                    className="flex items-start gap-4 p-6 hover:bg-white/[0.02] transition-colors group"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-all shadow-lg shadow-transparent group-hover:shadow-blue-500/20">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-lg font-semibold text-white truncate">{paper.title}</h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(paper.status)}`}>
                                                {paper.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-400 line-clamp-1 leading-relaxed mb-1">
                                            <span className="font-semibold text-slate-300">Authors:</span> {paper.authors?.map(getAuthorName).join(', ') || 'Unknown'}
                                        </p>
                                        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed mb-3">
                                            {getPaperAbstract(paper)}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {(paper.topics || []).map((topic) => (
                                                <span key={getTopicKey(topic)} className="px-2 py-1 rounded bg-white/5 text-slate-400 text-[10px] font-medium uppercase tracking-wider">
                                                    {getTopicLabel(topic)}
                                                </span>
                                            ))}
                                        </div>
                                        {filter === 'authored' && 'latestRoundNumber' in paper && (
                                            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {paper.latestRoundNumber ? `Round ${paper.latestRoundNumber}` : 'No rounds yet'}
                                                </span>
                                                {paper.latestRoundStatus && (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        {paper.latestRoundStatus}
                                                    </span>
                                                )}
                                                <span>Deadline: {formatDate(paper.latestRoundDeadline)}</span>
                                                {typeof paper.totalAssignments === 'number' && (
                                                    <span>{paper.completedAssignments || 0}/{paper.totalAssignments} reviews completed</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="shrink-0 flex items-center justify-center h-12 w-12 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all">
                                        <ChevronRight className="w-6 h-6" />
                                    </div>
                                </Link>
                            ))}
                            {papers.length === 0 && (
                                <div className="p-12 text-center text-slate-500">
                                    {hasActiveFilters ? 'No papers match the current filters.' : 'No papers found for this view.'}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
