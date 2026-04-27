'use client';

import React from 'react';
import { ApiError, getLabMembersRequest, type LabMember } from '@/lib/api';
import { useUser } from '@/components/context/UserContext';

export default function LabMembersPage() {
  const { user } = useUser();
  const [members, setMembers] = React.useState<LabMember[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!user.id) {
      return;
    }

    getLabMembersRequest()
      .then(response => {
        setMembers(response.users);
        setIsLoading(false);
      })
      .catch(caughtError => {
        setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load lab members.');
        setIsLoading(false);
      });
  }, [user.id]);

  const roleLabel = (role: string) => {
    if (role === 'Coordinator') {
      return 'Coordinator';
    }

    if (role === 'Admin') {
      return 'Admin';
    }

    return 'Lab Member';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Lab Members</h1>
        <p className="text-slate-400 mt-2">Browse approved members in the lab and see their core contact details.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <section className="glass rounded-2xl border border-white/5 p-8">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading lab members...</p>
        ) : members.length ? (
          <div className="space-y-4">
            {members.map(member => (
              <div key={member.id} className="rounded-2xl border border-white/10 bg-background/60 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{member.name}</p>
                    <p className="text-sm text-slate-300 mt-1">{member.email}</p>
                  </div>
                  <span className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200">
                    {roleLabel(member.role)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No approved lab members are available yet.</p>
        )}
      </section>
    </div>
  );
}
