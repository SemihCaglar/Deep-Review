'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, PencilLine, Tags, UserCircle2, X } from 'lucide-react';
import {
  ApiError,
  changePasswordRequest,
  getCurrentProfileRequest,
  getTopicsRequest,
  updateInterestsRequest,
  updateProfileRequest,
  type TopicOption,
} from '@/lib/api';
import { getStoredUser, mapStoredUserToLegacyUser, setStoredUser, type StoredAuthUser, type StoredTopic } from '@/lib/auth';
import { useUser } from '@/components/context/UserContext';

type ProfileModalProps = {
  onClose: () => void;
};

type ModalView = 'summary' | 'edit-interests' | 'change-password';
type EditableProfileField = 'name' | 'email';

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { setUser } = useUser();
  const [view, setView] = React.useState<ModalView>('summary');
  const viewRef = React.useRef<ModalView>('summary');
  const [storedUser, setLocalStoredUser] = React.useState<StoredAuthUser | null>(getStoredUser());
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [mounted, setMounted] = React.useState(false);

  const [editingField, setEditingField] = React.useState<EditableProfileField | null>(null);
  const [draftFieldValue, setDraftFieldValue] = React.useState('');
  const [isSavingProfileField, setIsSavingProfileField] = React.useState(false);

  const [topics, setTopics] = React.useState<TopicOption[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([]);
  const [otherInterestInputs, setOtherInterestInputs] = React.useState<string[]>(['']);
  const [isTopicsLoading, setIsTopicsLoading] = React.useState(false);
  const [isSavingInterests, setIsSavingInterests] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmNewPassword, setConfirmNewPassword] = React.useState('');
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);

  const refreshProfile = React.useCallback(async (options: { syncInterestDraft?: boolean } = {}) => {
    const { syncInterestDraft = true } = options;

    setIsLoading(true);
    setError('');

    try {
      const response = await getCurrentProfileRequest();
      setStoredUser(response.user);
      setLocalStoredUser(response.user);
      setUser(mapStoredUserToLegacyUser(response.user));

      if (syncInterestDraft && viewRef.current !== 'edit-interests') {
        setSelectedTopicIds(response.user.interests?.map(topic => String(topic.id)) ?? []);
        setOtherInterestInputs(response.user.otherInterests?.length ? response.user.otherInterests : ['']);
      }
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to load profile.');
    } finally {
      setIsLoading(false);
    }
  }, [setUser]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  React.useEffect(() => {
    viewRef.current = view;
  }, [view]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const normalInterestPills =
    storedUser?.interests
      ?.filter(topic => topic.name !== 'Other')
      .map(topic => ({ id: topic.id, label: topic.name })) ?? [];
  const otherInterestPills =
    storedUser?.interests?.some(topic => topic.name === 'Other')
      ? (storedUser.otherInterests ?? []).map((interest, index) => ({
          id: `other-${index}`,
          label: interest,
        }))
      : [];
  const interestPills = [...normalInterestPills, ...otherInterestPills];
  const showInterests = storedUser?.role === 'LabMember';
  const otherTopic = topics.find(topic => topic.name === 'Other');
  const isOtherSelected = !!otherTopic && selectedTopicIds.includes(String(otherTopic.id));

  const switchView = (nextView: ModalView) => {
    setError('');
    setEditingField(null);
    setDraftFieldValue('');
    viewRef.current = nextView;

    if (nextView === 'edit-interests') {
      loadTopics();
      setSelectedTopicIds(storedUser?.interests?.map(topic => String(topic.id)) ?? []);
      setOtherInterestInputs(storedUser?.otherInterests?.length ? storedUser.otherInterests : ['']);
    }

    if (nextView === 'change-password') {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    }

    setView(nextView);
  };

  const loadTopics = async () => {
    if (topics.length || isTopicsLoading) {
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

  const startFieldEdit = (field: EditableProfileField) => {
    if (!storedUser) {
      return;
    }

    setError('');
    setEditingField(field);
    setDraftFieldValue(field === 'name' ? storedUser.name : storedUser.email);
  };

  const cancelFieldEdit = () => {
    setError('');
    setEditingField(null);
    setDraftFieldValue('');
  };

  const saveFieldEdit = async () => {
    if (!storedUser || !editingField) {
      return;
    }

    const nextName = editingField === 'name' ? draftFieldValue.trim() : storedUser.name;
    const nextEmail = editingField === 'email' ? draftFieldValue.trim() : storedUser.email;

    if (!nextName || !nextEmail) {
      setError(editingField === 'name' ? 'Full Name is required.' : 'Email is required.');
      return;
    }

    setIsSavingProfileField(true);
    setError('');

    try {
      const profileResponse = await updateProfileRequest(nextName, nextEmail);
      setStoredUser(profileResponse.user);
      setLocalStoredUser(profileResponse.user);
      setUser(mapStoredUserToLegacyUser(profileResponse.user));
      setEditingField(null);
      setDraftFieldValue('');
      await refreshProfile({ syncInterestDraft: view !== 'edit-interests' });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to update profile.');
    } finally {
      setIsSavingProfileField(false);
    }
  };

  const toggleTopic = (topicId: string) => {
    const normalizedTopicId = String(topicId);

    setSelectedTopicIds(current =>
      current.includes(normalizedTopicId)
        ? current.filter(id => id !== normalizedTopicId)
        : [...current, normalizedTopicId],
    );
    setError('');
  };

  const updateOtherInterest = (index: number, value: string) => {
    setOtherInterestInputs(current => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
    setError('');
  };

  const addOtherInterestInput = () => {
    setOtherInterestInputs(current => [...current, '']);
    setError('');
  };

  const removeOtherInterestInput = (index: number) => {
    setOtherInterestInputs(current => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length ? next : [''];
    });
    setError('');
  };

  const handleInterestsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedOtherInterests = Array.from(
      new Set(otherInterestInputs.map(value => value.trim()).filter(Boolean)),
    );

    if (isOtherSelected && normalizedOtherInterests.length === 0) {
      setError('Please add at least one custom interest when Other is selected.');
      return;
    }

    setIsSavingInterests(true);
    setError('');

    try {
      const normalizedSelectedTopicIds = selectedTopicIds.map(String);
      const interestsResponse = await updateInterestsRequest(
        normalizedSelectedTopicIds,
        isOtherSelected ? normalizedOtherInterests : [],
      );
      const selectedTopics: StoredTopic[] = topics.filter(topic => normalizedSelectedTopicIds.includes(String(topic.id)));
      const nextStoredUser: StoredAuthUser = {
        ...interestsResponse.user,
        interests: selectedTopics,
        otherInterests: isOtherSelected ? normalizedOtherInterests : [],
      };

      setStoredUser(nextStoredUser);
      setLocalStoredUser(nextStoredUser);
      setUser(mapStoredUserToLegacyUser(nextStoredUser));
      viewRef.current = 'summary';
      setView('summary');
      await refreshProfile();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to update interests.');
    } finally {
      setIsSavingInterests(false);
    }
  };

  const handleChangePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsChangingPassword(true);
    setError('');

    try {
      await changePasswordRequest(currentPassword, newPassword, confirmNewPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      viewRef.current = 'summary';
      setView('summary');
      await refreshProfile();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to change password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const modalTitle =
    view === 'edit-interests' ? 'Edit Interests' : view === 'change-password' ? 'Change Password' : 'My Profile';
  const modalSubtitle =
    view === 'edit-interests'
        ? 'Choose your topics and add custom interests when needed.'
        : view === 'change-password'
          ? 'Update your password for the current signed-in account.'
          : 'Account details and profile settings.';

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
      <div
        className="glass pointer-events-auto relative z-10 mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 p-6 shadow-2xl"
      >
        <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 overflow-hidden">
            <h2 className="break-words text-xl font-semibold text-white">{modalTitle}</h2>
            <p className="break-words text-sm text-slate-400">{modalSubtitle}</p>
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
          <SummaryView
            error={error}
            draftFieldValue={draftFieldValue}
            editingField={editingField}
            interestPills={interestPills}
            isLoading={isLoading}
            isSavingProfileField={isSavingProfileField}
            onCancelFieldEdit={cancelFieldEdit}
            onChangePassword={() => switchView('change-password')}
            onEditInterests={() => switchView('edit-interests')}
            onFieldDraftChange={setDraftFieldValue}
            onSaveFieldEdit={saveFieldEdit}
            onStartFieldEdit={startFieldEdit}
            showInterests={showInterests}
            storedUser={storedUser}
          />
        ) : null}

        {view === 'edit-interests' && showInterests ? (
          <EditInterestsView
            error={error}
            isOtherSelected={isOtherSelected}
            isSaving={isSavingInterests}
            isTopicsLoading={isTopicsLoading}
            onAddOtherInterest={addOtherInterestInput}
            onCancel={() => switchView('summary')}
            onRemoveOtherInterest={removeOtherInterestInput}
            onSubmit={handleInterestsSubmit}
            onToggleTopic={toggleTopic}
            onUpdateOtherInterest={updateOtherInterest}
            otherInterestInputs={otherInterestInputs}
            selectedTopicIds={selectedTopicIds}
            topics={topics}
          />
        ) : null}

        {view === 'change-password' ? (
          <ChangePasswordView
            confirmNewPassword={confirmNewPassword}
            currentPassword={currentPassword}
            error={error}
            isSubmitting={isChangingPassword}
            newPassword={newPassword}
            onCancel={() => switchView('summary')}
            onConfirmNewPasswordChange={setConfirmNewPassword}
            onCurrentPasswordChange={setCurrentPassword}
            onNewPasswordChange={setNewPassword}
            onSubmit={handleChangePasswordSubmit}
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}

type SummaryViewProps = {
  draftFieldValue: string;
  editingField: EditableProfileField | null;
  error: string;
  interestPills: Array<{ id: string; label: string }>;
  isLoading: boolean;
  isSavingProfileField: boolean;
  onCancelFieldEdit: () => void;
  onChangePassword: () => void;
  onEditInterests: () => void;
  onFieldDraftChange: (value: string) => void;
  onSaveFieldEdit: () => void;
  onStartFieldEdit: (field: EditableProfileField) => void;
  showInterests: boolean;
  storedUser: StoredAuthUser | null;
};

function SummaryView({
  draftFieldValue,
  editingField,
  error,
  interestPills,
  isLoading,
  isSavingProfileField,
  onCancelFieldEdit,
  onChangePassword,
  onEditInterests,
  onFieldDraftChange,
  onSaveFieldEdit,
  onStartFieldEdit,
  showInterests,
  storedUser,
}: SummaryViewProps) {
  const isProfileLoading = isLoading && !storedUser;

  return (
    <div className="space-y-5">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <div className="mb-6 flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/15 text-blue-300">
            <UserCircle2 className="h-7 w-7" />
          </div>
          <div className="min-w-0 overflow-hidden">
            <h3 className="truncate text-xl font-semibold text-white">{storedUser?.name ?? 'Profile'}</h3>
            <p className="truncate text-sm text-slate-400">{storedUser?.email ?? ''}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <InlineProfileFieldCard
            ariaLabel="Edit full name"
            editType="text"
            isEditing={editingField === 'name'}
            isSaving={isSavingProfileField}
            label="Full Name"
            onCancel={onCancelFieldEdit}
            onChange={onFieldDraftChange}
            onEdit={() => onStartFieldEdit('name')}
            onSave={onSaveFieldEdit}
            value={storedUser?.name ?? 'Loading...'}
            draftValue={draftFieldValue}
          />
          <InlineProfileFieldCard
            ariaLabel="Edit email"
            editType="email"
            isEditing={editingField === 'email'}
            isSaving={isSavingProfileField}
            label="Email"
            onCancel={onCancelFieldEdit}
            onChange={onFieldDraftChange}
            onEdit={() => onStartFieldEdit('email')}
            onSave={onSaveFieldEdit}
            value={storedUser?.email ?? 'Loading...'}
            draftValue={draftFieldValue}
            valueClassName="break-all"
          />
        </div>

        {error && editingField ? <ErrorMessage error={error} /> : null}
      </section>

      {showInterests ? (
        <section className="min-w-0 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-5">
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Tags className="h-5 w-5 shrink-0 text-blue-300" />
              <h3 className="break-words text-lg font-semibold text-white">Interests</h3>
            </div>
            <button
              type="button"
              onClick={onEditInterests}
              className="min-w-0 break-words text-left text-sm text-blue-400 transition-colors hover:text-blue-300"
            >
              Add / Remove Interests
            </button>
          </div>

          {isProfileLoading ? (
            <p className="break-words text-sm text-slate-400">Loading profile...</p>
          ) : error && !editingField ? (
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
            <p className="break-words text-sm text-slate-400">You have not selected any topic interests yet.</p>
          )}
        </section>
      ) : null}

      <div className="min-w-0 space-y-3">
        <button
          type="button"
          onClick={onChangePassword}
          className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
        >
          <KeyRound className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">Change Password</span>
        </button>
      </div>
    </div>
  );
}

type InlineProfileFieldCardProps = {
  ariaLabel: string;
  draftValue: string;
  editType: 'text' | 'email';
  isEditing: boolean;
  isSaving: boolean;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  value: string;
  valueClassName?: string;
};

function InlineProfileFieldCard({
  ariaLabel,
  draftValue,
  editType,
  isEditing,
  isSaving,
  label,
  onCancel,
  onChange,
  onEdit,
  onSave,
  value,
  valueClassName = 'break-words',
}: InlineProfileFieldCardProps) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-background/60 p-4">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 break-words text-xs uppercase tracking-wider text-slate-500">{label}</p>
        {!isEditing ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-blue-400/30 hover:bg-blue-500/10 hover:text-blue-300"
            aria-label={ariaLabel}
            title={ariaLabel}
          >
            <PencilLine className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <div className="min-w-0 space-y-3">
          <input
            type={editType}
            value={draftValue}
            onChange={event => onChange(event.target.value)}
            className="w-full min-w-0 rounded-xl border border-white/10 bg-background px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            disabled={isSaving}
            required
          />
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="inline-flex min-w-0 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/60"
            >
              <span className="min-w-0 break-words">{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="min-w-0 break-words text-xs text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className={`${valueClassName} font-medium text-slate-100`}>{value}</p>
      )}
    </div>
  );
}

type EditInterestsViewProps = {
  error: string;
  isOtherSelected: boolean;
  isSaving: boolean;
  isTopicsLoading: boolean;
  onAddOtherInterest: () => void;
  onCancel: () => void;
  onRemoveOtherInterest: (index: number) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleTopic: (topicId: string) => void;
  onUpdateOtherInterest: (index: number, value: string) => void;
  otherInterestInputs: string[];
  selectedTopicIds: string[];
  topics: TopicOption[];
};

function EditInterestsView({
  error,
  isOtherSelected,
  isSaving,
  isTopicsLoading,
  onAddOtherInterest,
  onCancel,
  onRemoveOtherInterest,
  onSubmit,
  onToggleTopic,
  onUpdateOtherInterest,
  otherInterestInputs,
  selectedTopicIds,
  topics,
}: EditInterestsViewProps) {
  return (
    <form onSubmit={onSubmit} className="min-w-0 space-y-6">
      {isTopicsLoading ? (
        <p className="break-words text-sm text-slate-400">Loading interests...</p>
      ) : (
        <div className="min-w-0 space-y-4">
          <p className="break-words text-sm text-slate-400">
            Selected topics: <span className="font-medium text-slate-200">{selectedTopicIds.length}</span>
          </p>
          <div className="flex min-w-0 flex-wrap gap-2">
            {topics.map(topic => {
              const topicId = String(topic.id);
              const selected = selectedTopicIds.includes(topicId);
              return (
                <button
                  key={topicId}
                  type="button"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleTopic(topicId);
                  }}
                  onPointerDown={event => {
                    event.stopPropagation();
                  }}
                  aria-pressed={selected}
                  className={`pointer-events-auto max-w-full cursor-pointer select-none break-words rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                    selected
                      ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                  disabled={isSaving}
                >
                  {topic.name}
                </button>
              );
            })}
          </div>

          {isOtherSelected ? (
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <label className="break-words text-sm font-medium text-slate-300">Please specify</label>
                <button
                  type="button"
                  onClick={onAddOtherInterest}
                  className="break-words text-sm text-blue-400 transition-colors hover:text-blue-300"
                  disabled={isSaving}
                >
                  Add another
                </button>
              </div>
              <div className="min-w-0 space-y-3">
                {otherInterestInputs.map((value, index) => (
                  <div key={`other-interest-${index}`} className="flex min-w-0 flex-wrap items-center gap-3 sm:flex-nowrap">
                    <input
                      value={value}
                      onChange={event => onUpdateOtherInterest(index, event.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-background px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      disabled={isSaving}
                      placeholder="Describe a custom interest"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveOtherInterest(index)}
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

      <ErrorMessage error={error} />

      <ModalActions
        cancelLabel="Cancel"
        isSaving={isSaving || isTopicsLoading}
        onCancel={onCancel}
        submitLabel={isSaving ? 'Saving...' : 'Save Interests'}
      />
    </form>
  );
}

type ChangePasswordViewProps = {
  confirmNewPassword: string;
  currentPassword: string;
  error: string;
  isSubmitting: boolean;
  newPassword: string;
  onCancel: () => void;
  onConfirmNewPasswordChange: (value: string) => void;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function ChangePasswordView({
  confirmNewPassword,
  currentPassword,
  error,
  isSubmitting,
  newPassword,
  onCancel,
  onConfirmNewPasswordChange,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onSubmit,
}: ChangePasswordViewProps) {
  return (
    <form onSubmit={onSubmit} className="min-w-0 space-y-5">
      <Field label="Current Password">
        <input
          type="password"
          value={currentPassword}
          onChange={event => onCurrentPasswordChange(event.target.value)}
          className="w-full min-w-0 rounded-xl border border-white/10 bg-background px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          disabled={isSubmitting}
          placeholder="Current password"
          required
        />
      </Field>

      <Field label="New Password">
        <input
          type="password"
          value={newPassword}
          onChange={event => onNewPasswordChange(event.target.value)}
          className="w-full min-w-0 rounded-xl border border-white/10 bg-background px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          disabled={isSubmitting}
          placeholder="New password"
          required
        />
      </Field>

      <Field label="Confirm New Password">
        <input
          type="password"
          value={confirmNewPassword}
          onChange={event => onConfirmNewPasswordChange(event.target.value)}
          className="w-full min-w-0 rounded-xl border border-white/10 bg-background px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          disabled={isSubmitting}
          placeholder="Confirm new password"
          required
        />
      </Field>

      <ErrorMessage error={error} />

      <ModalActions
        cancelLabel="Cancel"
        isSaving={isSubmitting}
        onCancel={onCancel}
        submitLabel={isSubmitting ? 'Changing Password...' : 'Change Password'}
      />
    </form>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <label className="mb-2 block break-words text-sm font-medium text-slate-300">{label}</label>
      {children}
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  if (!error) {
    return null;
  }

  return (
    <div className="break-words rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {error}
    </div>
  );
}

function ModalActions({
  cancelLabel,
  isSaving,
  onCancel,
  submitLabel,
}: {
  cancelLabel: string;
  isSaving: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex min-w-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/60"
      >
        <span className="min-w-0 break-words">{submitLabel}</span>
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="min-w-0 break-words text-sm text-slate-400 transition-colors hover:text-slate-200"
      >
        {cancelLabel}
      </button>
    </div>
  );
}
