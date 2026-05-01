'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { UserCircle2, X } from 'lucide-react';
import { useUser } from '@/components/context/UserContext';

type ProfileModalProps = {
  onClose: () => void;
};

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { user } = useUser();
  const [mounted, setMounted] = React.useState(false);

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
            <h2 className="break-words text-xl font-semibold text-white">My Profile</h2>
            <p className="break-words text-sm text-slate-400">Account details and profile settings.</p>
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
      </div>
    </div>,
    document.body,
  );
}
