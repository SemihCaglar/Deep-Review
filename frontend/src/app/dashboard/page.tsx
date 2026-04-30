'use client';

import React from 'react';
import { BarChart2, CheckCircle, ChevronDown, ChevronUp, Clock, FileText, UserCheck } from 'lucide-react';
import {
  ApiError,
  getOverallAnalyticsRequest,
  getPendingSignupsRequest,
  type OverallAnalyticsResponse,
  type ReviewerRanking,
} from '@/lib/api';
import { useUser } from '@/components/context/UserContext';
import { LabTopicManager } from '@/components/LabTopicManager';

type SortKey =
  | 'aggregateScore'
  | 'avgQualityScore'
  | 'avgQuantityScore'
  | 'avgTimeScore'
  | 'totalCompleted'
  | 'totalIncomplete'
  | 'totalDeclined';

function formatScore(value: number | null): string {
  return value !== null ? value.toFixed(2) : '–';
}

function SortButton({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === currentKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center justify-end gap-1 w-full text-xs font-semibold uppercase tracking-wide transition-colors ${
        isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
      {isActive ? (
        direction === 'desc' ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronUp className="w-3 h-3 shrink-0" />
      ) : (
        <ChevronDown className="w-3 h-3 shrink-0 opacity-30" />
      )}
    </button>
  );
}

const SCORE_COLUMNS: { label: string; key: SortKey; field: keyof ReviewerRanking }[] = [
  { label: 'Aggregate', key: 'aggregateScore', field: 'aggregateScore' },
  { label: 'Quality',   key: 'avgQualityScore', field: 'avgQualityScore' },
  { label: 'Quantity',  key: 'avgQuantityScore', field: 'avgQuantityScore' },
  { label: 'Timeliness', key: 'avgTimeScore',   field: 'avgTimeScore' },
];

const COUNT_COLUMNS: { label: string; key: SortKey; field: keyof ReviewerRanking; color: string }[] = [
  { label: 'Completed', key: 'totalCompleted',  field: 'totalCompleted',  color: 'text-emerald-400' },
  { label: 'Incomplete', key: 'totalIncomplete', field: 'totalIncomplete', color: 'text-amber-400' },
  { label: 'Declined',  key: 'totalDeclined',   field: 'totalDeclined',   color: 'text-red-400' },
];

export default function DashboardPage() {
  const { user } = useUser();

  const [pendingCount, setPendingCount] = React.useState(0);
  const [isLoadingPending, setIsLoadingPending] = React.useState(false);
  const [pendingError, setPendingError] = React.useState('');

  const [analytics, setAnalytics] = React.useState<OverallAnalyticsResponse | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = React.useState(false);
  const [analyticsError, setAnalyticsError] = React.useState('');
  const [sortKey, setSortKey] = React.useState<SortKey>('aggregateScore');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');

  const loadPendingSignups = React.useCallback(async () => {
    if (!user.isCoordinator) return;
    setIsLoadingPending(true);
    setPendingError('');
    try {
      const response = await getPendingSignupsRequest();
      setPendingCount(response.users.length);
    } catch (caughtError) {
      setPendingError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load pending approvals.');
    } finally {
      setIsLoadingPending(false);
    }
  }, [user.isCoordinator]);

  const loadAnalytics = React.useCallback(async () => {
    if (!user.isCoordinator) return;
    setIsLoadingAnalytics(true);
    setAnalyticsError('');
    try {
      const data = await getOverallAnalyticsRequest();
      setAnalytics(data);
    } catch (caughtError) {
      setAnalyticsError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load leaderboard.');
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [user.isCoordinator]);

  React.useEffect(() => {
    loadPendingSignups();
    loadAnalytics();
  }, [loadPendingSignups, loadAnalytics]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedRankings = React.useMemo<ReviewerRanking[]>(() => {
    if (!analytics) return [];
    return [...analytics.rankings].sort((a, b) => {
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [analytics, sortKey, sortDir]);

  const stats = user.isCoordinator
    ? [
        { label: 'Pending Approvals', value: isLoadingPending ? '...' : pendingCount, icon: UserCheck, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Coordinator Access', value: 1, icon: FileText, color: 'text-white', bg: 'bg-white/10' },
      ]
    : [
        { label: 'Account Status', value: 'Active', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { label: 'Profile Access', value: 'Ready', icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Review Access', value: 'Open', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
      ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Welcome, {user.name}</h1>
        <p className="text-slate-400 mt-2">
          {user.isCoordinator
            ? 'Review pending account requests and keep the system moving.'
            : 'Your account is ready to use once coordinator approval and assignments are available.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass p-6 rounded-2xl border border-white/5 flex items-center gap-5 hover:bg-white/5 transition-colors">
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

      {user.isCoordinator && pendingError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pendingError}
        </div>
      )}

      {user.isCoordinator && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-400" />
            Reviewer Leaderboard
          </h2>

          {analyticsError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {analyticsError}
            </div>
          )}

          {isLoadingAnalytics && (
            <div className="glass rounded-2xl border border-white/5 p-8 text-center text-slate-400 text-sm">
              Loading leaderboard…
            </div>
          )}

          {!isLoadingAnalytics && analytics && (
            <>
              {sortedRankings.length === 0 ? (
                <div className="glass rounded-2xl border border-white/5 p-8 text-center text-slate-400 text-sm">
                  No reviewers in your lab yet.
                </div>
              ) : (
                <div className="glass rounded-2xl border border-white/5 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-10">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          Reviewer
                        </th>
                        {SCORE_COLUMNS.map(col => (
                          <th
                            key={col.key}
                            className={`px-4 py-3 transition-colors ${sortKey === col.key ? 'bg-blue-500/8' : ''}`}
                          >
                            <SortButton
                              label={col.label}
                              sortKey={col.key}
                              currentKey={sortKey}
                              direction={sortDir}
                              onSort={handleSort}
                            />
                          </th>
                        ))}
                        {COUNT_COLUMNS.map(col => (
                          <th
                            key={col.key}
                            className={`px-4 py-3 transition-colors ${sortKey === col.key ? 'bg-blue-500/8' : ''}`}
                          >
                            <SortButton
                              label={col.label}
                              sortKey={col.key}
                              currentKey={sortKey}
                              direction={sortDir}
                              onSort={handleSort}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRankings.map((reviewer, idx) => {
                        const isFirst = idx === 0;
                        return (
                          <tr
                            key={reviewer.userId}
                            className={`border-b border-white/5 last:border-0 transition-colors hover:bg-white/5 ${isFirst ? 'bg-amber-500/5' : ''}`}
                          >
                            <td className="px-4 py-3 text-center">
                              <span className={`font-bold tabular-nums ${isFirst ? 'text-amber-400' : 'text-slate-400'}`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-white">{reviewer.name}</p>
                              <p className="text-xs text-slate-500">{reviewer.email}</p>
                            </td>
                            {SCORE_COLUMNS.map(col => (
                              <td
                                key={col.key}
                                className={`px-4 py-3 text-right tabular-nums transition-colors ${sortKey === col.key ? 'bg-blue-500/8' : ''} ${col.key === 'aggregateScore' ? 'font-semibold text-white' : 'text-slate-300'}`}
                              >
                                {formatScore(reviewer[col.field] as number | null)}
                              </td>
                            ))}
                            {COUNT_COLUMNS.map(col => (
                              <td
                                key={col.key}
                                className={`px-4 py-3 text-right tabular-nums font-medium transition-colors ${sortKey === col.key ? 'bg-blue-500/8' : ''} ${col.color}`}
                              >
                                {reviewer[col.field] as number}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {user.labs && user.labs.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-400" />
            Lab Management
          </h2>
          <div className="grid gap-6">
            {user.labs.map(lab => (
              <LabTopicManager key={lab.id} labId={lab.id} labName={lab.name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
