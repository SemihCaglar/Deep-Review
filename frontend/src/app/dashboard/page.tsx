'use client';

import React from 'react';
import { CheckCircle, Clock, FileText, UserCheck } from 'lucide-react';
import { ApiError, getPendingSignupsRequest } from '@/lib/api';
import { useUser } from '@/components/context/UserContext';
import { LabTopicManager } from '@/components/LabTopicManager';

export default function DashboardPage() {
  const { user } = useUser();
  const [pendingCount, setPendingCount] = React.useState(0);
  const [isLoadingPending, setIsLoadingPending] = React.useState(false);
  const [pendingError, setPendingError] = React.useState('');

  const loadPendingSignups = React.useCallback(async () => {
    if (!user.isCoordinator) {
      return;
    }

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

  React.useEffect(() => {
    loadPendingSignups();
  }, [loadPendingSignups]);

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

      {user.isCoordinator && pendingError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pendingError}
        </div>
      ) : null}

      {/* Lab Management for Coordinators and Members */}
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
