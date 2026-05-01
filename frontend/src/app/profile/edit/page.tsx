'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError, getCurrentProfileRequest, updateProfileRequest } from '@/lib/api';
import { getStoredUser, mapStoredUserToLegacyUser, setStoredUser, type StoredAuthUser } from '@/lib/auth';
import { useUser } from '@/components/context/UserContext';
import { getProfileReturnHref } from '@/lib/profileReturn';

export default function EditProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useUser();
  const [storedUser, setLocalStoredUser] = React.useState<StoredAuthUser | null>(null);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const returnHref = React.useMemo(() => getProfileReturnHref(searchParams), [searchParams]);

  React.useEffect(() => {
    const cachedUser = getStoredUser();

    if (!cachedUser) {
      router.replace('/login');
      return;
    }

    getCurrentProfileRequest()
      .then(profileResponse => {
        setLocalStoredUser(profileResponse.user);
        setStoredUser(profileResponse.user);
        setName(profileResponse.user.name);
        setEmail(profileResponse.user.email);
        setIsLoading(false);
      })
      .catch(caughtError => {
        setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load profile.');
        setIsLoading(false);
      });
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!storedUser) {
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const profileResponse = await updateProfileRequest(name, email);
      const nextStoredUser: StoredAuthUser = {
        ...storedUser,
        ...profileResponse.user,
      };

      setStoredUser(nextStoredUser);
      setLocalStoredUser(nextStoredUser);
      setUser(mapStoredUserToLegacyUser(nextStoredUser));
      router.push(returnHref);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to update profile.');
      setIsSaving(false);
    }
  };

  if (!storedUser) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href={returnHref} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to profile
        </Link>
      </div>

      <div className="glass rounded-2xl border border-white/5 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Update Profile</h1>
          <p className="text-slate-400 mt-2">Edit your full name and email.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              Full Name
            </label>
            <input
              id="name"
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              disabled={isSaving || isLoading}
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              disabled={isSaving || isLoading}
              required
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving || isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-not-allowed px-5 py-3 text-sm font-semibold text-white transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <Link href={returnHref} className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
