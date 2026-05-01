'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, UserCircle2, X } from 'lucide-react';
import { useUser } from '@/components/context/UserContext';
import { ApiError, changePasswordRequest } from '@/lib/api';

type ProfileModalProps = {
  onClose: () => void;
};

type ProfileModalView = 'summary' | 'change-password';

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { user } = useUser();
  const [mounted, setMounted] = React.useState(false);
  const [view, setView] = React.useState<ProfileModalView>('summary');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmNewPassword, setConfirmNewPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState('');
  const [error, setError] = React.useState('');

  const showSummary = () => {
    setView('summary');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setFeedback('');
    setError('');
  };

  const openChangePassword = () => {
    setView('change-password');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setFeedback('');
    setError('');
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

  React.useEffect(() => {
    setMounted(true);
  }, []);

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
            <h2 className="break-words text-xl font-semibold text-white">
              {view === 'change-password' ? 'Change Password' : 'My Profile'}
            </h2>
            <p className="break-words text-sm text-slate-400">
              {view === 'change-password'
                ? 'Update your account password securely.'
                : 'Account details and profile settings.'}
            </p>
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
                  <h3 className="truncate text-xl font-semibold text-white">{user.name}</h3>
                  <p className="truncate text-sm text-slate-400">{user.email}</p>
                </div>
              </div>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-background/60 p-4">
                  <p className="mb-2 break-words text-xs uppercase tracking-wider text-slate-500">Full Name</p>
                  <p className="break-words font-medium text-slate-100">{user.name}</p>
                </div>
                <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-background/60 p-4">
                  <p className="mb-2 break-words text-xs uppercase tracking-wider text-slate-500">Email</p>
                  <p className="break-all font-medium text-slate-100">{user.email}</p>
                </div>
              </div>
            </section>

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
      </div>
    </div>,
    document.body,
  );
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
