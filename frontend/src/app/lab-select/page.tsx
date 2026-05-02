'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, DoorOpen, Plus, X } from 'lucide-react';
import {
  ApiError,
  getLabsRequest,
  getMyLabsRequest,
  submitLabJoinRequest,
  type Lab,
  type LabMembership,
} from '@/lib/api';
import { useLabContext } from '@/components/context/LabContext';
import { getStoredUser, getToken } from '@/lib/auth';

export default function LabSelectPage() {
  const router = useRouter();
  const { selectLab: setSelectedLab } = useLabContext();
  const [memberships, setMemberships] = React.useState<LabMembership[]>([]);
  const [availableLabs, setAvailableLabs] = React.useState<Lab[]>([]);
  const [selectedLabId, setSelectedLabId] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isJoinModalOpen, setIsJoinModalOpen] = React.useState(false);
  const [isLabsLoading, setIsLabsLoading] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [joinError, setJoinError] = React.useState('');

  React.useEffect(() => {
    const storedUser = getStoredUser();

    if (!getToken() || !storedUser) {
      router.replace('/login');
      return;
    }

    if (storedUser.role === 'Admin' || storedUser.role === 'Coordinator') {
      router.replace(storedUser.role === 'Admin' ? '/admin' : '/dashboard');
      return;
    }

    getMyLabsRequest()
      .then(response => {
        setMemberships(response.memberships);
        setError('');
      })
      .catch(caughtError => {
        setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load labs.');
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  const openJoinModal = async () => {
    setIsJoinModalOpen(true);
    setJoinError('');
    setSelectedLabId('');

    if (availableLabs.length) {
      return;
    }

    setIsLabsLoading(true);

    try {
      const labs = await getLabsRequest();
      setAvailableLabs(labs);
    } catch (caughtError) {
      setJoinError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load labs.');
    } finally {
      setIsLabsLoading(false);
    }
  };

  const closeJoinModal = () => {
    if (isSubmitting) {
      return;
    }

    setIsJoinModalOpen(false);
    setJoinError('');
    setSelectedLabId('');
  };

  const selectLab = (membership: LabMembership) => {
    if (!membership.lab || membership.status === 'Pending') {
      return;
    }

    setSelectedLab({
      id: membership.lab.id,
      name: membership.lab.name,
      status: membership.status,
    });
    router.push('/dashboard');
  };

  const submitJoinRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedLabId) {
      setJoinError('Please choose a lab.');
      return;
    }

    setIsSubmitting(true);
    setJoinError('');

    try {
      const response = await submitLabJoinRequest(selectedLabId);
      setMemberships(current => [...current, response.membership]);
      setIsJoinModalOpen(false);
      setSelectedLabId('');
    } catch (caughtError) {
      setJoinError(caughtError instanceof ApiError ? caughtError.message : 'Failed to submit request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const existingLabIds = new Set(memberships.map(membership => membership.lab?.id).filter(Boolean));
  const joinableLabs = availableLabs.filter(lab => !existingLabIds.has(lab.id));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/80">Lab Access</p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Choose a lab</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Select an active lab to continue, or request access to another lab.
        </p>
      </div>

      {isLoading ? (
        <section className="glass rounded-2xl border border-white/5 p-8 text-sm text-slate-400">
          Loading labs...
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">
          {error}
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {memberships.map(membership => (
            <LabCard key={membership.id} membership={membership} onSelect={() => selectLab(membership)} />
          ))}

          <button
            type="button"
            onClick={openJoinModal}
            className="glass flex min-h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/10 p-6 text-center transition-colors hover:border-blue-400/50 hover:bg-white/[0.04]"
          >
            <Plus className="mb-3 h-7 w-7 text-blue-300" />
            <span className="text-sm font-semibold text-white">Request another lab</span>
          </button>
        </section>
      )}

      {isJoinModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div className="glass w-full max-w-lg rounded-2xl border border-white/10 p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Request lab access</h2>
                <p className="mt-1 text-sm text-slate-400">Choose a lab and submit a coordinator review request.</p>
              </div>
              <button
                type="button"
                onClick={closeJoinModal}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
                aria-label="Close lab request"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitJoinRequest} className="space-y-4">
              {isLabsLoading ? (
                <p className="text-sm text-slate-400">Loading labs...</p>
              ) : joinableLabs.length ? (
                <select
                  value={selectedLabId}
                  onChange={event => setSelectedLabId(event.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-white/10 bg-background px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  required
                >
                  <option value="">Select a lab</option>
                  {joinableLabs.map(lab => (
                    <option key={lab.id} value={lab.id}>
                      {lab.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                  No additional labs are available to request.
                </p>
              )}

              {joinError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {joinError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || isLabsLoading || !joinableLabs.length}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/60"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={closeJoinModal}
                  disabled={isSubmitting}
                  className="text-sm text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LabCard({ membership, onSelect }: { membership: LabMembership; onSelect: () => void }) {
  const isPending = membership.status === 'Pending';
  const isAlumni = membership.status === 'Alumni';
  const Icon = isPending ? Clock3 : CheckCircle2;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isPending || !membership.lab}
      className={`glass min-h-44 rounded-2xl border p-6 text-left transition-colors ${
        isPending
          ? 'cursor-not-allowed border-amber-500/20 bg-amber-500/[0.04] opacity-80'
          : isAlumni
            ? 'border-slate-500/20 bg-white/[0.02] hover:bg-white/[0.04]'
            : 'border-blue-500/25 bg-blue-500/[0.05] hover:bg-blue-500/[0.09]'
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Icon className={`h-6 w-6 ${isPending ? 'text-amber-300' : isAlumni ? 'text-slate-400' : 'text-blue-300'}`} />
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-300">
          {membership.status}
        </span>
      </div>
      <h2 className={`text-lg font-semibold ${isAlumni ? 'text-slate-300' : 'text-white'}`}>
        {membership.lab?.name ?? 'Unknown lab'}
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        {isPending
          ? 'Waiting for coordinator approval.'
          : isAlumni
            ? 'Read-only access for alumni membership.'
            : membership.lab?.description || 'Continue with this lab.'}
      </p>
      {!isPending && membership.lab ? (
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-blue-300">
          <DoorOpen className="h-4 w-4" />
          Continue
        </span>
      ) : null}
    </button>
  );
}
