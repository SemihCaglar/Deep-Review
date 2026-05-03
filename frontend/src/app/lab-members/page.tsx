'use client';

import React from 'react';
import { CheckCircle, RotateCcw, Snowflake } from 'lucide-react';
import { ApiError, getLabMembersRequest, freezeMemberRequest, unfreezeMemberRequest, type LabMember } from '@/lib/api';
import { useUser } from '@/components/context/UserContext';
import { LabTopicManager } from '@/components/LabTopicManager';

export default function LabMembersPage() {
  const { user } = useUser();
  const [activeMembers, setActiveMembers] = React.useState<LabMember[]>([]);
  const [frozenMembers, setFrozenMembers] = React.useState<LabMember[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const loadMembers = React.useCallback(() => {
    if (!user.id) return;
    setIsLoading(true);
    getLabMembersRequest()
      .then(response => {
        setActiveMembers(response.users);
        setFrozenMembers(response.frozenUsers ?? []);
        setIsLoading(false);
      })
      .catch(caughtError => {
        setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load lab members.');
        setIsLoading(false);
      });
  }, [user.id]);

  React.useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleFreeze = async (memberId: string) => {
    setPendingId(memberId);
    setActionError('');
    try {
      await freezeMemberRequest(memberId);
      loadMembers();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to freeze account.');
    } finally {
      setPendingId(null);
    }
  };

  const handleUnfreeze = async (memberId: string) => {
    setPendingId(memberId);
    setActionError('');
    try {
      await unfreezeMemberRequest(memberId);
      loadMembers();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to unfreeze account.');
    } finally {
      setPendingId(null);
    }
  };

  const roleLabel = (role: string) => {
    if (role === 'Coordinator') return 'Coordinator';
    if (role === 'Admin') return 'Admin';
    return 'Lab Member';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Lab Information</h1>
        {user.labs && user.labs.length > 0 && (
          <h2 className="text-xl font-medium text-blue-400 mt-1">{user.labs.map(l => l.name).join(', ')}</h2>
        )}
        <p className="text-slate-400 mt-2">Browse lab members, alumni, and the topics assigned to your lab.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      {actionError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{actionError}</div>
      ) : null}

      {/* Lab Coordinator */}
      <section className="glass rounded-2xl border border-white/5 p-8">
        <h2 className="text-lg font-semibold text-white mb-5">Lab Coordinator</h2>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : activeMembers.filter(m => m.role === 'Coordinator').length ? (
          <div className="space-y-4">
            {activeMembers
              .filter(m => m.role === 'Coordinator')
              .map(member => {
                const isSelf = member.id === user.id;
                return (
                  <div
                    key={member.id}
                    className="rounded-2xl border p-5 border-blue-400/25 bg-blue-500/[0.07] shadow-[0_0_24px_rgba(59,130,246,0.08)]"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold text-white">
                          {member.name} {isSelf && <span className="text-xs font-normal text-slate-500 ml-1">(You)</span>}
                        </p>
                        <p className="text-sm text-slate-300 mt-0.5">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold border-blue-400/35 bg-blue-500/15 text-blue-100">
                          Coordinator
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No coordinators found.</p>
        )}
      </section>

      {/* Active Members */}
      <section className="glass rounded-2xl border border-white/5 p-8">
        <h2 className="text-lg font-semibold text-white mb-5">Active Members</h2>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading lab members...</p>
        ) : activeMembers.filter(m => m.role !== 'Coordinator').length ? (
          <div className="space-y-4">
            {activeMembers
              .filter(m => m.role !== 'Coordinator')
              .map(member => {
                const isSelf = member.id === user.id;
                return (
                  <div
                    key={member.id}
                    className="rounded-2xl border p-5 border-white/10 bg-background/60"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold text-white">
                          {member.name} {isSelf && <span className="text-xs font-normal text-slate-500 ml-1">(You)</span>}
                        </p>
                        <p className="text-sm text-slate-300 mt-0.5">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold border-blue-500/20 bg-blue-500/10 text-blue-200">
                          {roleLabel(member.role)}
                        </span>
                        {user.isCoordinator && !isSelf ? (
                          <button
                            onClick={() => handleFreeze(member.id)}
                            disabled={pendingId === member.id}
                            title="Freeze account (mark as alumni)"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Snowflake className="w-3.5 h-3.5" />
                            {pendingId === member.id ? 'Freezing...' : 'Freeze'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No other active lab members.</p>
        )}
      </section>

      {/* Alumni / Frozen Members */}
      {(frozenMembers.length > 0 || user.isCoordinator) && (
        <section className="glass rounded-2xl border border-white/5 p-8">
          <div className="flex items-center gap-2 mb-5">
            <Snowflake className="w-4 h-4 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Alumni</h2>
            {frozenMembers.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 border border-white/10">
                {frozenMembers.length}
              </span>
            )}
          </div>
          {frozenMembers.length ? (
            <div className="space-y-4">
              {frozenMembers.map(member => (
                <div key={member.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 opacity-80">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-slate-300">{member.name}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{member.email}</p>
                      {member.currentPosition ? (
                        <p className="text-xs text-slate-400 mt-1 italic">{member.currentPosition}</p>
                      ) : (
                        <p className="text-xs text-slate-600 mt-1 italic">No current position listed</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold border-slate-600/40 bg-slate-700/30 text-slate-400">
                        Alumni
                      </span>
                      {user.isCoordinator ? (
                        <button
                          onClick={() => handleUnfreeze(member.id)}
                          disabled={pendingId === member.id}
                          title="Unfreeze account (restore to active)"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {pendingId === member.id ? 'Unfreezing...' : 'Reactivate'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No alumni yet. Frozen accounts will appear here.</p>
          )}
        </section>
      )}

      {/* Lab Topics */}
      {!user.isFrozen && user.labs && user.labs.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-400" />
            Lab Topics
          </h2>
          <div className="grid gap-6">
            {user.labs.map(lab => (
              <LabTopicManager key={lab.id} labId={lab.id} labName={lab.name} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
