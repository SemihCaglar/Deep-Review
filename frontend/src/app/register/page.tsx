'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import { BookOpen, CheckCircle2, Users, ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import { getLabMembersRequest, getTopicsRequest, registerPaperRequest, LabMember, TopicOption } from '@/lib/api';

export default function RegisterPaper() {
    const { user } = useUser();
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [availableUsers, setAvailableUsers] = useState<LabMember[]>([]);
    const [topicsList, setTopicsList] = useState<TopicOption[]>([]);

    // Form state
    const [title, setTitle] = useState('');
    const [abstractText, setAbstractText] = useState('');
    const [overleafLink, setOverleafLink] = useState('');
    const [overleafError, setOverleafError] = useState('');

    const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
    const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

    const [authorSearch, setAuthorSearch] = useState('');
    const [topicSearch, setTopicSearch] = useState('');

    useEffect(() => {
        if (user.isFrozen) {
            router.replace('/dashboard');
            return;
        }
    }, [user.isFrozen, router]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [membersRes, topicsRes] = await Promise.all([
                    getLabMembersRequest(),
                    getTopicsRequest()
                ]);
                setAvailableUsers(membersRes.users);
                setTopicsList(topicsRes);

                // Automatically add current user to authors if not already there
                if (user?.id && !selectedAuthors.includes(user.id)) {
                    setSelectedAuthors([user.id]);
                }
            } catch (err) {
                console.error('Failed to fetch form data', err);
            }
        };
        fetchData();
    }, [user?.id, selectedAuthors]);

    if (!user.id) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <h2 className="text-xl font-bold text-red-400">Access Denied</h2>
                <p className="text-slate-400 mt-2">Please login to register papers.</p>
            </div>
        );
    }

    const toggleAuthor = (id: string) => {
        if (selectedAuthors.includes(id)) {
            // Prevent removing self if that's desired, but user said "added automatically"
            // If they want to remove themselves they can, but let's assume they stay.
            setSelectedAuthors(selectedAuthors.filter(a => a !== id));
        } else {
            setSelectedAuthors([...selectedAuthors, id]);
        }
    };

    const moveAuthor = (index: number, direction: 'up' | 'down') => {
        const newAuthors = [...selectedAuthors];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newAuthors.length) return;

        [newAuthors[index], newAuthors[targetIndex]] = [newAuthors[targetIndex], newAuthors[index]];
        setSelectedAuthors(newAuthors);
    };

    const toggleTopic = (topicId: string) => {
        if (selectedTopics.includes(topicId)) {
            setSelectedTopics(selectedTopics.filter(t => t !== topicId));
        } else {
            setSelectedTopics([...selectedTopics, topicId]);
        }
    };

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        if (step === 1) {
            if (!overleafLink.trim()) {
                setOverleafError('Overleaf link is required.');
                return;
            }
            if (!/^https?:\/\/([a-z0-9-]+\.)*overleaf\.com\//i.test(overleafLink.trim())) {
                setOverleafError('The link must be a valid Overleaf URL (e.g. https://www.overleaf.com/...).');
                return;
            }
            setOverleafError('');
        }
        if (step < 3) setStep(step + 1);
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            await registerPaperRequest({
                title,
                abstractText,
                overleafLink,

                authors: selectedAuthors,
                topics: selectedTopics,
            });
            router.push(user.isCoordinator ? '/papers' : '/papers?filter=authored');
        } catch (err) {
            console.error(err);
            alert('Failed to register paper. Please try again.');
            setIsSubmitting(false);
        }
    };

    // Filtered lists
    const filteredUsers = availableUsers
        .filter(u => u.id !== user.id && u.role !== 'Coordinator' && u.role !== 'Admin')
        .filter(u =>
            u.name.toLowerCase().includes(authorSearch.toLowerCase()) ||
            u.email.toLowerCase().includes(authorSearch.toLowerCase())
        );

    const filteredTopics = topicsList
        .filter(t => t.name.toLowerCase().includes(topicSearch.toLowerCase()));

    return (
        <div className="max-w-3xl mx-auto py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">Register New Paper</h1>
                <p className="text-slate-400 mt-1">Submit a manuscript and assign authors for BILSEN review.</p>
            </div>

            <div className="flex items-center justify-between mb-8 relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-white/10 z-0"></div>
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-blue-500 z-0 transition-all duration-500" style={{ width: `${((step - 1) / 2) * 100}%` }}></div>

                {[
                    { num: 1, label: 'Basic Info', icon: BookOpen },
                    { num: 2, label: 'Meta & Authors', icon: Users },
                    { num: 3, label: 'Review', icon: CheckCircle2 }
                ].map(s => (
                    <div key={s.num} className="relative z-10 flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${step >= s.num ? 'bg-blue-600 border-blue-500 text-white' : 'bg-background border-slate-700 text-slate-500'
                            }`}>
                            <s.icon className="w-5 h-5" />
                        </div>
                        <span className={`text-xs font-semibold ${step >= s.num ? 'text-blue-400' : 'text-slate-500'}`}>{s.label}</span>
                    </div>
                ))}
            </div>

            <div className="glass p-8 rounded-2xl border border-white/5 shadow-xl">
                <form onSubmit={step === 3 ? handleSubmit : handleNext}>

                    {step === 1 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Paper Title <span className="text-red-400">*</span></label>
                                <input required type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter full paper title..." className="w-full bg-background border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Abstract <span className="text-red-400">*</span></label>
                                <textarea required rows={5} value={abstractText} onChange={e => setAbstractText(e.target.value)} placeholder="Provide a detailed abstract of the work..." className="w-full bg-background border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none"></textarea>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Overleaf Link <span className="text-red-400">*</span></label>
                                <input type="text" value={overleafLink} onChange={e => { setOverleafLink(e.target.value); setOverleafError(''); }} placeholder="https://www.overleaf.com/..." className={`w-full bg-background border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm ${overleafError ? 'border-red-500/50' : 'border-white/10'}`} />
                                {overleafError && <p className="mt-1.5 text-xs text-red-400">{overleafError}</p>}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 fade-in duration-300">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Assign Authors</label>
                                <p className="text-slate-500 text-sm mb-4">Select users from the system to be attached as authors.</p>

                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search by name or email..."
                                        value={authorSearch}
                                        onChange={(e) => setAuthorSearch(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    />
                                    {authorSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setAuthorSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors"
                                        >
                                            <X className="w-3 h-3 text-slate-400" />
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                    {filteredUsers.length === 0 ? (
                                        <p className="col-span-2 text-center py-8 text-slate-500 text-sm border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                                            No matching members found.
                                        </p>
                                    ) : (
                                        filteredUsers.map(u => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                onClick={() => toggleAuthor(u.id)}
                                                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedAuthors.includes(u.id) ? 'bg-blue-600/20 border-blue-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                            >
                                                <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${selectedAuthors.includes(u.id) ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                                    {u.name.charAt(0)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`font-medium truncate ${selectedAuthors.includes(u.id) ? 'text-blue-100' : 'text-slate-300'}`}>{u.name}</p>
                                                    <p className={`text-xs truncate ${selectedAuthors.includes(u.id) ? 'text-blue-300/70' : 'text-slate-500'}`}>{u.email}</p>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>

                                {selectedAuthors.length > 0 && (
                                    <div className="mt-6 pt-6 border-t border-white/5">
                                        <label className="block text-sm font-medium text-slate-300 mb-4">Author List & Order</label>
                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {selectedAuthors.map((authorId, index) => {
                                                const authorInfo = availableUsers.find(u => u.id === authorId) || (authorId === user.id ? { name: user.name + ' (You)', email: user.email } : null);
                                                if (!authorInfo) return null;
                                                return (
                                                    <div key={authorId} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl group">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-blue-500 font-bold text-sm w-4">{index + 1}.</span>
                                                            <div>
                                                                <p className="text-sm font-medium text-white">{authorInfo.name}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1 items-center">
                                                            <div className="flex gap-1">
                                                                <button
                                                                    type="button"
                                                                    disabled={index === 0}
                                                                    onClick={() => moveAuthor(index, 'up')}
                                                                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 disabled:opacity-20"
                                                                >
                                                                    <ArrowUp className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={index === selectedAuthors.length - 1}
                                                                    onClick={() => moveAuthor(index, 'down')}
                                                                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 disabled:opacity-20"
                                                                >
                                                                    <ArrowDown className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                            {authorId !== user.id && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleAuthor(authorId)}
                                                                    className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-6 border-t border-white/5">
                                <label className="block text-sm font-medium text-slate-300 mb-2">Topics & Keywords</label>
                                <p className="text-slate-500 text-sm mb-4">Select relevant areas to help assign appropriate reviewers.</p>

                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search topics..."
                                        value={topicSearch}
                                        onChange={(e) => setTopicSearch(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    />
                                    {topicSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setTopicSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors"
                                        >
                                            <X className="w-3 h-3 text-slate-400" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                    {filteredTopics.length === 0 ? (
                                        <p className="w-full text-center py-4 text-slate-500 text-sm italic">No matching topics found.</p>
                                    ) : (
                                        filteredTopics.map(topic => (
                                            <button
                                                key={topic.id}
                                                type="button"
                                                onClick={() => toggleTopic(topic.id)}
                                                className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${selectedTopics.includes(topic.id) ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}
                                            >
                                                {topic.name}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>

                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300 text-center py-6">
                            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-bold text-white">Ready to Register</h3>
                            <p className="text-slate-400 max-w-md mx-auto">
                                The paper will be created in the <strong>Draft</strong> state. {user.isCoordinator
                                    ? 'Once it is registered, you can initialize the first review round from the paper details page.'
                                    : 'Once it is registered, the first review round can be initialized by a Coordinator from the paper details page.'}
                                <br /><br />
                                {selectedAuthors.length > 0 && <span className="text-blue-400">{selectedAuthors.length} author(s) will be notified by the Email Service.</span>}
                            </p>
                        </div>
                    )}

                    <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/5">
                        <button
                            type="button"
                            onClick={handleBack}
                            disabled={step === 1 || isSubmitting}
                            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-colors ${step === 1 ? 'opacity-0 cursor-default' : 'text-slate-300 hover:bg-white/5 border border-white/10'}`}
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {step === 3 ? (isSubmitting ? 'Registering...' : 'Complete Registration') : 'Continue'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
