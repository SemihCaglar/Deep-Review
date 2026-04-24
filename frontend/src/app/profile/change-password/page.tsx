'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ChangePasswordPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to profile
        </Link>
      </div>

      <div className="glass rounded-2xl border border-white/5 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Change Password</h1>
          <p className="text-slate-400 mt-2">This form is ready, but backend password change is not available yet.</p>
        </div>

        <form className="space-y-5">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-300 mb-2">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              disabled
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white/70 disabled:cursor-not-allowed"
              placeholder="Current password"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-300 mb-2">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              disabled
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white/70 disabled:cursor-not-allowed"
              placeholder="New password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              disabled
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white/70 disabled:cursor-not-allowed"
              placeholder="Confirm new password"
            />
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Password change UI is ready, but the backend endpoint is not implemented yet.
          </div>

          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600/60 cursor-not-allowed px-5 py-3 text-sm font-semibold text-white"
          >
            Change Password
          </button>

          <div>
            <Link href="/forgot-password" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
              Forgot your password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
