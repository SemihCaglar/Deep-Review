'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Check, KeyRound, Pencil, Plus, Tags, Trash2, UserCircle2, X } from 'lucide-react';
import { useUser } from '@/components/context/UserContext';
import {
  ApiError,
  changePasswordRequest,
  getCurrentProfileRequest,
  getTopicsRequest,
  updateInterestsRequest,
  updateProfileRequest,
  type TopicOption,
} from '@/lib/api';
import {
  getStoredUser,
  mapStoredUserToLegacyUser,
  setStoredUser,
  type StoredAuthUser,
  type StoredTopic,
} from '@/lib/auth';

type ProfileModalProps = {
  onClose: () => void;
};

type ProfileModalView = 'summary' | 'change-password' | 'edit-interests';
type EditableProfileField = 'name' | 'email' | 'currentPosition';

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, setUser } = useUser();
  const [mounted, setMounted] = React.useState(false);
  const [view, setView] = React.useState<ProfileModalView>('summary');
  const [profileUser, setProfileUser] = React.useState<StoredAuthUser | null>(null);
  const [isProfileLoading, setIsProfileLoading] = React.useState(true);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmNewPassword, setConfirmNewPassword] = React.useState('');
  const [topics, setTopics] = React.useState<TopicOption[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([]);
  const [otherInterestInputs, setOtherInterestInputs] = React.useState<string[]>(['']);
  const [editingField, setEditingField] = React.useState<EditableProfileField | null>(null);
  const [fieldDraft, setFieldDraft] = React.useState('');
  const [isTopicsLoading, setIsTopicsLoading] = React.useState(false);
  const [isFieldSaving, setIsFieldSaving] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState('');
  const [error, setError] = React.useState('');
  const setLegacyUserRef = React.useRef(setUser);

  const displayName = profileUser?.name ?? user.name;
  const displayEmail = profileUser?.email ?? user.email;
  const displayCurrentPosition = profileUser?.currentPosition ?? '';
  const isLabMember = profileUser?.role === 'LabMember';
  const otherTopic = topics.find(topic => topic.name === 'Other');
  const isOtherSelected = !!otherTopic && selectedTopicIds.includes(otherTopic.id);

  const normalInterestPills =
    profileUser?.interests
      ?.filter(topic => topic.name !== 'Other')
      .map(topic => ({ id: topic.id, label: topic.name })) ?? [];
  const otherInterestPills =
    profileUser?.interests?.some(topic => topic.name === 'Other')
      ? (profileUser.otherInterests ?? []).map((interest, index) => ({
          id: `other-${index}`,
          label: interest,
        }))
      : [];
  const interestPills = [...normalInterestPills, ...otherInterestPills];

  const syncProfileUser = React.useCallback(
    (nextUser: StoredAuthUser) => {
      setStoredUser(nextUser);
      setProfileUser(nextUser);
      setLegacyUserRef.current(mapStoredUserToLegacyUser(nextUser));
    },
    [],
  );

  const refreshProfile = React.useCallback(async () => {
    const cachedUser = getStoredUser();

    if (cachedUser) {
      setProfileUser(cachedUser);
    }

    try {
      const response = await getCurrentProfileRequest();
      syncProfileUser(response.user);
      setSelectedTopicIds(response.user.interests?.map(topic => topic.id) ?? []);
      setOtherInterestInputs(response.user.otherInterests?.length ? response.user.otherInterests : ['']);
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load profile.');
    } finally {
      setIsProfileLoading(false);
    }
  }, [syncProfileUser]);

  const showSummary = () => {
    setView('summary');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setError('');
  };

  const openChangePassword = () => {
    setEditingField(null);
    setView('change-password');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setFeedback('');
    setError('');
  };

  const openEditInterests = async () => {
    if (!isLabMember) {
      return;
    }

    setEditingField(null);
    setView('edit-interests');
    setFeedback('');
    setError('');
    setSelectedTopicIds(profileUser?.interests?.map(topic => topic.id) ?? []);
    setOtherInterestInputs(profileUser?.otherInterests?.length ? profileUser.otherInterests : ['']);

    if (topics.length) {
      return;
    }

    setIsTopicsLoading(true);

    try {
      const fetchedTopics = await getTopicsRequest();
      setTopics(fetchedTopics);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load interests.');
    } finally {
      setIsTopicsLoading(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback('');
    setError('');

    try {
      const response = await changePasswordRequest(currentPassword, newPassword, confirmNewPassword);
      setFeedback(response.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setView('summary');
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to change password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startFieldEdit = (field: EditableProfileField) => {
    setEditingField(field);
    if (field === 'name') setFieldDraft(displayName);
    else if (field === 'email') setFieldDraft(displayEmail);
    else setFieldDraft(displayCurrentPosition);
    setFeedback('');
    setError('');
  };

  const cancelFieldEdit = () => {
    setEditingField(null);
    setFieldDraft('');
    setError('');
  };

  const saveFieldEdit = async () => {
    if (!profileUser || !editingField) {
      return;
    }

    const trimmedValue = fieldDraft.trim();

    if (!trimmedValue && editingField !== 'currentPosition') {
      setError(editingField === 'name' ? 'Full name is required.' : 'Email is required.');
      return;
    }

    const nextName = editingField === 'name' ? trimmedValue : displayName;
    const nextEmail = editingField === 'email' ? trimmedValue : displayEmail;
    const nextCurrentPosition = editingField === 'currentPosition' ? trimmedValue : displayCurrentPosition;

    setIsFieldSaving(true);
    setFeedback('');
    setError('');

    try {
      const response = await updateProfileRequest(nextName, nextEmail, nextCurrentPosition);
      const nextUser: StoredAuthUser = {
        ...profileUser,
        ...response.user,
      };

      syncProfileUser(nextUser);
      setEditingField(null);
      setFieldDraft('');
      setFeedback('Profile updated successfully.');
      void refreshProfile();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to update profile.');
    } finally {
      setIsFieldSaving(false);
    }
  };

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds(current =>
      current.includes(topicId) ? current.filter(id => id !== topicId) : [...current, topicId],
    );
    setFeedback('');
    setError('');
  };

  const updateOtherInterest = (index: number, value: string) => {
    setOtherInterestInputs(current => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
    setFeedback('');
    setError('');
  };

  const addOtherInterestInput = () => {
    setOtherInterestInputs(current => [...current, '']);
    setFeedback('');
    setError('');
  };

  const removeOtherInterestInput = (index: number) => {
    setOtherInterestInputs(current => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length ? next : [''];
    });
    setFeedback('');
    setError('');
  };

  const handleInterestsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profileUser || !isLabMember) {
      return;
    }

    const normalizedOtherInterests = Array.from(
      new Set(otherInterestInputs.map(value => value.trim()).filter(Boolean)),
    );

    if (isOtherSelected && normalizedOtherInterests.length === 0) {
      setError('Please add at least one custom interest when Other is selected.');
      return;
    }

    setIsSubmitting(true);
    setFeedback('');
    setError('');

    try {
      const response = await updateInterestsRequest(
        selectedTopicIds,
        isOtherSelected ? normalizedOtherInterests : [],
      );
      const selectedTopics: StoredTopic[] = topics.filter(topic => selectedTopicIds.includes(topic.id));
      const nextUser: StoredAuthUser = {
        ...profileUser,
        ...response.user,
        interests: selectedTopics,
        otherInterests: isOtherSelected ? normalizedOtherInterests : [],
      };

      syncProfileUser(nextUser);
      setFeedback('Interests updated successfully.');
      setView('summary');
      void refreshProfile();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to update interests.');
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    setLegacyUserRef.current = setUser;
  }, [setUser]);

  React.useEffect(() => {
    if (!mounted) {
      return;
    }

    void refreshProfile();
  }, [mounted, refreshProfile]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm"
      onClick={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="glass relative mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 p-6 shadow-2xl">
        <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 overflow-hidden">
            <h2 className="break-words text-xl font-semibold text-white">{getTitle(view)}</h2>
            <p className="break-words text-sm text-slate-400">{getSubtitle(view)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
            aria-label="Close profile"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {view === 'summary' ? (
          <div className="space-y-5">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-5">
              <div className="mb-6 flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/15 text-blue-300">
                  <UserCircle2 className="h-7 w-7" />
                </div>
                <div className="min-w-0 overflow-hidden">
                  <h3 className="truncate text-xl font-semibold text-white">{displayName}</h3>
                  <p className="truncate text-sm text-slate-400">{displayEmail}</p>
                </div>
              </div>

              {profileUser?.frozenAt ? (
                <div className="mb-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
                  ❄️ Your account is currently frozen (Alumni). You can still update your profile.
                </div>
              ) : null}

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <ProfileFieldCard
                  disabled={isFieldSaving}
                  editing={editingField === 'name'}
                  inputType="text"
                  label="Full Name"
                  onCancel={cancelFieldEdit}
                  onChange={setFieldDraft}
                  onEdit={() => startFieldEdit('name')}
                  onSave={saveFieldEdit}
                  value={displayName}
                  draftValue={fieldDraft}
                />
                <ProfileFieldCard
                  disabled={isFieldSaving}
                  editing={editingField === 'email'}
                  inputType="email"
                  label="Email"
                  onCancel={cancelFieldEdit}
                  onChange={setFieldDraft}
                  onEdit={() => startFieldEdit('email')}
                  onSave={saveFieldEdit}
                  value={displayEmail}
                  draftValue={fieldDraft}
                  breakAll
                />
                {profileUser?.frozenAt ? (
                  <div className="sm:col-span-2">
                    <ProfileFieldCard
                      disabled={isFieldSaving}
                      editing={editingField === 'currentPosition'}
                      inputType="text"
                      label="Current Position"
                      onCancel={cancelFieldEdit}
                      onChange={setFieldDraft}
                      onEdit={() => startFieldEdit('currentPosition')}
                      onSave={saveFieldEdit}
                      value={displayCurrentPosition}
                      draftValue={fieldDraft}
                      optional
                      placeholder="e.g. PhD Candidate at MIT, Engineer at Google"
                    />
                  </div>
                ) : null}
              </div>
            </section>

            {isLabMember ? (
              <section className="min-w-0 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-5">
                <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Tags className="h-5 w-5 shrink-0 text-blue-300" />
                    <h3 className="min-w-0 break-words text-lg font-semibold text-white">Interests</h3>
                  </div>
                  <button
                    type="button"
                    onClick={openEditInterests}
                    className="min-w-0 break-words text-sm text-blue-400 transition-colors hover:text-blue-300"
                  >
                    Add / Remove Interests
                  </button>
                </div>

                {isProfileLoading ? (
                  <p className="break-words text-sm text-slate-400">Loading profile...</p>
                ) : error ? (
                  <div className="break-words rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                ) : interestPills.length ? (
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {interestPills.map(topic => (
                      <span
                        key={topic.id}
                        className="max-w-full break-words rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-sm text-blue-200"
                      >
                        {topic.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="break-words text-sm text-slate-400">
                    You have not selected any topic interests yet.
                  </p>
                )}
              </section>
            ) : null}

            {feedback ? (
              <div className="break-words rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {feedback}
              </div>
            ) : null}

            <button
              type="button"
              onClick={openChangePassword}
              className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              <KeyRound className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">Change Password</span>
            </button>
          </div>
        ) : null}

        {view === 'change-password' ? (
          <form onSubmit={handleChangePassword} className="min-w-0 space-y-5">
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              disabled={isSubmitting}
            />
            <PasswordField
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              disabled={isSubmitting}
            />
            <PasswordField
              label="Confirm New Password"
              value={confirmNewPassword}
              onChange={setConfirmNewPassword}
              disabled={isSubmitting}
            />

            {error ? (
              <div className="break-words rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-w-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/60"
              >
                <span className="min-w-0 break-words">
                  {isSubmitting ? 'Changing Password...' : 'Change Password'}
                </span>
              </button>
              <button
                type="button"
                onClick={showSummary}
                disabled={isSubmitting}
                className="min-w-0 break-words text-sm text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {view === 'edit-interests' ? (
          <form onSubmit={handleInterestsSubmit} className="min-w-0 space-y-5">
            {isTopicsLoading ? (
              <p className="break-words text-sm text-slate-400">Loading interests...</p>
            ) : (
              <div className="min-w-0 space-y-4">
                <p className="break-words text-sm text-slate-400">
                  Selected topics: <span className="font-medium text-slate-200">{selectedTopicIds.length}</span>
                </p>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {topics.map(topic => {
                    const selected = selectedTopicIds.includes(topic.id);

                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => toggleTopic(topic.id)}
                        aria-pressed={selected}
                        className={`max-w-full break-words rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                          selected
                            ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                        disabled={isSubmitting}
                      >
                        {topic.name}
                      </button>
                    );
                  })}
                </div>

                {isOtherSelected ? (
                  <div className="min-w-0 space-y-3">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                      <label className="min-w-0 break-words text-sm font-medium text-slate-300">
                        Please specify
                      </label>
                      <button
                        type="button"
                        onClick={addOtherInterestInput}
                        className="inline-flex min-w-0 items-center gap-1.5 break-words text-sm text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-60"
                        disabled={isSubmitting}
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        Add another
                      </button>
                    </div>
                    <div className="min-w-0 space-y-3">
                      {otherInterestInputs.map((value, index) => (
                        <div key={`other-interest-${index}`} className="flex min-w-0 flex-wrap items-center gap-3 sm:flex-nowrap">
                          <input
                            value={value}
                            onChange={event => updateOtherInterest(index, event.target.value)}
                            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-background px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            disabled={isSubmitting}
                            placeholder="Describe a custom interest"
                          />
                          <button
                            type="button"
                            onClick={() => removeOtherInterestInput(index)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-60"
                            disabled={isSubmitting || otherInterestInputs.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
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
              <div className="break-words rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || isTopicsLoading}
                className="inline-flex min-w-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/60"
              >
                <span className="min-w-0 break-words">
                  {isSubmitting ? 'Saving...' : 'Save Interests'}
                </span>
              </button>
              <button
                type="button"
                onClick={showSummary}
                disabled={isSubmitting}
                className="min-w-0 break-words text-sm text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function getTitle(view: ProfileModalView) {
  if (view === 'change-password') {
    return 'Change Password';
  }

  if (view === 'edit-interests') {
    return 'Edit Interests';
  }

  return 'My Profile';
}

function getSubtitle(view: ProfileModalView) {
  if (view === 'change-password') {
    return 'Update your account password securely.';
  }

  if (view === 'edit-interests') {
    return 'Choose your topics and add custom interests when needed.';
  }

  return 'Account details and profile settings.';
}

function PasswordField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-2 block break-words text-sm font-medium text-slate-300">
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full min-w-0 rounded-xl border border-white/10 bg-background px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        disabled={disabled}
        required
      />
    </div>
  );
}

function ProfileFieldCard({
  breakAll = false,
  disabled,
  draftValue,
  editing,
  inputType,
  label,
  onCancel,
  onChange,
  onEdit,
  onSave,
  optional = false,
  placeholder = '',
  value,
}: {
  breakAll?: boolean;
  disabled: boolean;
  draftValue: string;
  editing: boolean;
  inputType: 'email' | 'text';
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  optional?: boolean;
  placeholder?: string;
  value: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-background/60 p-4">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 break-words text-xs uppercase tracking-wider text-slate-500">{label}</p>
        {!editing ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="min-w-0 space-y-3">
          <input
            type={inputType}
            value={draftValue}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
            className="w-full min-w-0 rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-white placeholder:text-slate-500 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            disabled={disabled}
            autoFocus
            required={!optional}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={disabled}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/60"
            >
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{disabled ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 disabled:opacity-60"
              aria-label={`Cancel ${label} edit`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        optional && !value ? (
          <p className="break-words text-sm text-slate-500 italic">Not set</p>
        ) : (
          <p className={`${breakAll ? 'break-all' : 'break-words'} font-medium text-slate-100`}>{value}</p>
        )
      )}
    </div>
  );
}
