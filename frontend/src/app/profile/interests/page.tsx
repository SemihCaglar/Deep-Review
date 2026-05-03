'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Tags } from 'lucide-react';
import {
  ApiError,
  getCurrentProfileRequest,
  getTopicsRequest,
  updateInterestsRequest,
  addTopicToLabRequest,
  type TopicOption,
} from '@/lib/api';
import { getStoredUser, mapStoredUserToLegacyUser, setStoredUser, type StoredAuthUser, type StoredTopic } from '@/lib/auth';
import { useUser } from '@/components/context/UserContext';
import { confirmCancel } from '@/lib/confirmAction';

export default function EditInterestsPage() {
  const router = useRouter();
  const { setUser } = useUser();
  const [storedUser, setLocalStoredUser] = React.useState<StoredAuthUser | null>(null);
  const [topics, setTopics] = React.useState<TopicOption[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([]);
  const [otherInterestInputs, setOtherInterestInputs] = React.useState<string[]>(['']);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [successMessage, setSuccessMessage] = React.useState('');
  const [newTopicName, setNewTopicName] = React.useState('');
  const [selectedLabId, setSelectedLabId] = React.useState('');
  const [isAddingTopic, setIsAddingTopic] = React.useState(false);

  React.useEffect(() => {
    const cachedUser = getStoredUser();

    if (!cachedUser) {
      router.replace('/login');
      return;
    }

    Promise.all([getCurrentProfileRequest(), getTopicsRequest()])
      .then(([profileResponse, fetchedTopics]) => {
        setStoredUser(profileResponse.user);
        setLocalStoredUser(profileResponse.user);
        setTopics(fetchedTopics);
        setSelectedTopicIds(profileResponse.user.interests?.map(topic => topic.id) ?? []);
        setOtherInterestInputs(profileResponse.user.otherInterests?.length ? profileResponse.user.otherInterests : ['']);
        if (profileResponse.user.labs && profileResponse.user.labs.length > 0) {
          setSelectedLabId(profileResponse.user.labs[0].id);
        }
        setIsLoading(false);
      })
      .catch(caughtError => {
        setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load interests.');
        setIsLoading(false);
      });
  }, [router]);

  const otherTopic = topics.find(topic => topic.name === 'Other');
  const isOtherSelected = !!otherTopic && selectedTopicIds.includes(otherTopic.id);

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds(current =>
      current.includes(topicId) ? current.filter(id => id !== topicId) : [...current, topicId],
    );
    setSuccessMessage('');
    setError('');
  };

  const updateOtherInterest = (index: number, value: string) => {
    setOtherInterestInputs(current => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
    setSuccessMessage('');
    setError('');
  };

  const addOtherInterestInput = () => {
    setOtherInterestInputs(current => [...current, '']);
    setSuccessMessage('');
    setError('');
  };

  const removeOtherInterestInput = (index: number) => {
    setOtherInterestInputs(current => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length ? next : [''];
    });
    setSuccessMessage('');
    setError('');
  };

  const handleAddTopic = async () => {
    if (!newTopicName.trim() || !selectedLabId) return;

    setIsAddingTopic(true);
    setError('');
    setSuccessMessage('');

    try {
      const newTopic = await addTopicToLabRequest(selectedLabId, newTopicName.trim());
      setTopics(prev => {
        if (prev.some(t => t.id === newTopic.id)) return prev;
        return [...prev, newTopic];
      });
      setSelectedTopicIds(prev => {
        if (prev.includes(newTopic.id)) return prev;
        return [...prev, newTopic.id];
      });
      setNewTopicName('');
      setSuccessMessage(`Topic "${newTopic.name}" added successfully.`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to add topic.');
    } finally {
      setIsAddingTopic(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!storedUser) {
      return;
    }

    const normalizedOtherInterests = Array.from(
      new Set(otherInterestInputs.map(value => value.trim()).filter(Boolean)),
    );

    if (isOtherSelected && normalizedOtherInterests.length === 0) {
      setError('Please add at least one custom interest when Other is selected.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const interestsResponse = await updateInterestsRequest(
        selectedTopicIds,
        isOtherSelected ? normalizedOtherInterests : [],
      );

      const selectedTopics: StoredTopic[] = topics.filter(topic => selectedTopicIds.includes(topic.id));
      const nextStoredUser: StoredAuthUser = {
        ...storedUser,
        ...interestsResponse.user,
        interests: selectedTopics,
        otherInterests: isOtherSelected ? normalizedOtherInterests : [],
      };

      setStoredUser(nextStoredUser);
      setLocalStoredUser(nextStoredUser);
      setUser(mapStoredUserToLegacyUser(nextStoredUser));
      setSuccessMessage('Interests updated successfully.');
      window.setTimeout(() => {
        router.push('/profile');
      }, 250);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to update interests.');
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
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-300 border border-blue-400/20 flex items-center justify-center">
              <Tags className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Edit Interests</h1>
              <p className="text-slate-400 mt-2">Choose your topics and add a custom interest when needed.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading interests...</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Selected topics: <span className="text-slate-200 font-medium">{selectedTopicIds.length}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {topics.map(topic => {
                  const selected = selectedTopicIds.includes(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => toggleTopic(topic.id)}
                      aria-pressed={selected}
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

              <div className="pt-4 border-t border-white/5 space-y-3">
                <p className="text-sm font-medium text-slate-300">Missing a topic? Add it to your lab:</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={e => setNewTopicName(e.target.value)}
                    placeholder="New topic name"
                    className="bg-background border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all flex-1 min-w-[200px]"
                    disabled={isAddingTopic || isSaving}
                  />
                  {storedUser.labs && storedUser.labs.length > 1 && (
                    <select
                      value={selectedLabId}
                      onChange={e => setSelectedLabId(e.target.value)}
                      className="bg-background border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      disabled={isAddingTopic || isSaving}
                    >
                      {storedUser.labs.map(lab => (
                        <option key={lab.id} value={lab.id}>{lab.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={handleAddTopic}
                    disabled={isAddingTopic || isSaving || !newTopicName.trim() || !selectedLabId}
                    className="shrink-0 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50 transition-colors"
                  >
                    {isAddingTopic ? 'Adding...' : 'Add Topic'}
                  </button>
                </div>
              </div>

              {isOtherSelected ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-slate-300">
                      Please specify
                    </label>
                    <button
                      type="button"
                      onClick={addOtherInterestInput}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                      disabled={isSaving}
                    >
                      Add another
                    </button>
                  </div>
                  <div className="space-y-3">
                    {otherInterestInputs.map((value, index) => (
                      <div key={`other-interest-${index}`} className="flex items-center gap-3">
                        <input
                          value={value}
                          onChange={event => updateOtherInterest(index, event.target.value)}
                          className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                          disabled={isSaving}
                          placeholder="Describe a custom interest"
                        />
                        <button
                          type="button"
                          onClick={() => removeOtherInterestInput(index)}
                          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-60"
                          disabled={isSaving || otherInterestInputs.length === 1}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {successMessage}
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving || isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-not-allowed px-5 py-3 text-sm font-semibold text-white transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Interests'}
            </button>
            <Link
              href="/profile"
              onClick={async (event) => {
                event.preventDefault();
                if (await confirmCancel()) {
                  router.push('/profile');
                }
              }}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
