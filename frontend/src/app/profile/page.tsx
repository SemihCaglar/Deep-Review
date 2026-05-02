'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, PencilLine, Tags, UserCircle2 } from 'lucide-react';
import { ApiError, getCurrentProfileRequest } from '@/lib/api';
import { getStoredUser, setStoredUser } from '@/lib/auth';
import { MOCK_PAPERS } from '@/lib/mockData';

export default function ProfilePage() {
  const router = useRouter();
  const [storedUser, setLocalStoredUser] = React.useState(getStoredUser());
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const cachedUser = getStoredUser();

    if (!cachedUser) {
      router.replace('/login');
      return;
    }

    setLocalStoredUser(cachedUser);

    getCurrentProfileRequest()
      .then(response => {
        setStoredUser(response.user);
        setLocalStoredUser(response.user);
        setIsLoading(false);
      })
      .catch(caughtError => {
        setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load profile.');
        setIsLoading(false);
      });
  }, [router]);

  if (!storedUser) {
    return null;
  }

  const authoredPapers = MOCK_PAPERS.filter(paper => paper.authors.includes(storedUser.id));
  const normalInterestPills =
    storedUser.interests
      ?.filter(topic => topic.name !== 'Other')
      .map(topic => ({ id: topic.id, label: topic.name })) ?? [];
  const otherInterestPills =
    storedUser.interests?.some(topic => topic.name === 'Other')
      ? (storedUser.otherInterests ?? []).map((interest, index) => ({
          id: `other-${index}`,
          label: interest,
        }))
      : [];
  const interestPills = [...normalInterestPills, ...otherInterestPills];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Profile</h1>
          <p className="text-slate-400 mt-2">View your account details and keep your interests up to date.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/profile/edit"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <PencilLine className="w-4 h-4" />
            Update Profile
          </Link>
          <Link
            href="/profile/change-password"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            Change Password
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 text-blue-300 border border-blue-400/20 flex items-center justify-center">
              <UserCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{storedUser.name}</h2>
              <p className="text-sm text-slate-400">{storedUser.email}</p>
            </div>
          </div>

          {storedUser.frozenAt ? (
            <div className="mb-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
              ❄️ Your account is currently frozen (Alumni). You can still update your profile.
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Full Name</p>
              <p className="text-slate-100 font-medium">{storedUser.name}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Email</p>
              <p className="text-slate-100 font-medium">{storedUser.email}</p>
            </div>
            {storedUser.frozenAt ? (
              <div className="rounded-xl border border-white/10 bg-background/60 p-4 sm:col-span-2">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Current Position</p>
                <p className="text-slate-100 font-medium">
                  {storedUser.currentPosition || <span className="text-slate-500 italic">Not set — add in profile edit</span>}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Tags className="w-5 h-5 text-blue-300" />
              <h2 className="text-lg font-semibold text-white">Interests</h2>
            </div>
            <Link
              href="/profile/interests"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
            >
              Add / Remove Interests
            </Link>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-400">Loading profile...</p>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : interestPills.length ? (
            <div className="flex flex-wrap gap-2">
              {interestPills.map(topic => (
                <span
                  key={topic.id}
                  className="px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-sm text-blue-200"
                >
                  {topic.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">You have not selected any topic interests yet.</p>
          )}
        </section>
      </div>

      {authoredPapers.length ? (
        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Authored Papers</h2>
              <p className="text-sm text-slate-400">Quick view of papers already visible in the current UI data.</p>
            </div>
            <Link href="/papers?filter=authored" className="text-sm text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
              Open papers
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-3">
            {authoredPapers.map(paper => (
              <div key={paper.id} className="rounded-xl border border-white/10 bg-background/60 p-4">
                <p className="font-medium text-white">{paper.title}</p>
                <p className="text-sm text-slate-400 mt-1">{paper.status}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
