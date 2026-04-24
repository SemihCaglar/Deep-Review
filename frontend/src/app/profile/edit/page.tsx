'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api';
import { getStoredUser, mapStoredUserToLegacyUser, setStoredUser, type StoredAuthUser, type StoredTopic } from '@/lib/auth';
import { useUser } from '@/components/context/UserContext';

type TopicOption = {
  id: string;
  name: string;
};

type AccountUserResponse = {
  message: string;
  user: StoredAuthUser;
};

export default function EditProfilePage() {
  const router = useRouter();
  const { setUser } = useUser();
  const [storedUser, setLocalStoredUser] = React.useState<StoredAuthUser | null>(null);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [topics, setTopics] = React.useState<TopicOption[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const authUser = getStoredUser();

    if (!authUser) {
      router.replace('/login');
      return;
    }

    setLocalStoredUser(authUser);
    setName(authUser.name);
    setEmail(authUser.email);
    setSelectedTopicIds(authUser.interests?.map(topic => topic.id) ?? []);

    apiRequest<TopicOption[]>('/topics')
      .then(fetchedTopics => {
        setTopics(fetchedTopics);
        setIsLoading(false);
      })
      .catch(caughtError => {
        setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load topics.');
        setIsLoading(false);
      });
  }, [router]);

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds(current =>
      current.includes(topicId) ? current.filter(id => id !== topicId) : [...current, topicId],
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!storedUser) {
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const profileResponse = await apiRequest<AccountUserResponse>('/account/profile', {
        method: 'PUT',
        body: {
          name,
          email,
        },
      });

      const interestsResponse = await apiRequest<AccountUserResponse>('/account/interests', {
        method: 'PUT',
        body: {
          topicIds: selectedTopicIds,
        },
      });

      const selectedTopics: StoredTopic[] = topics.filter(topic => selectedTopicIds.includes(topic.id));
      const nextStoredUser: StoredAuthUser = {
        ...profileResponse.user,
        ...interestsResponse.user,
        interests: selectedTopics,
      };

      setStoredUser(nextStoredUser);
      setUser(mapStoredUserToLegacyUser(nextStoredUser));
      router.push('/profile');
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
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to profile
        </Link>
      </div>

      <div className="glass rounded-2xl border border-white/5 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Update Profile</h1>
          <p className="text-slate-400 mt-2">Edit your full name, email, and topic interests.</p>
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
              disabled={isSaving}
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
              disabled={isSaving}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">Topic Interests</label>
            {isLoading ? (
              <p className="text-sm text-slate-400">Loading topics...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {topics.map(topic => {
                  const selected = selectedTopicIds.includes(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => toggleTopic(topic.id)}
                      className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                        selected
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                      disabled={isSaving}
                    >
                      {topic.name}
                    </button>
                  );
                })}
              </div>
            )}
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
            <Link href="/profile" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
