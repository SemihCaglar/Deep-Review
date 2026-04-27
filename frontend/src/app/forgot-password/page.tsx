'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, MailQuestion } from 'lucide-react';
import { ApiError, forgotPasswordRequest } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setIsSubmitting(true);

    try {
      const response = await forgotPasswordRequest(email);
      setMessage(response.message || 'If an account exists for that email, a reset link has been sent.');
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to send reset request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div>
        <Link href="/login" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
      </div>

      <div className="glass rounded-2xl border border-white/5 p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/15 text-blue-300 border border-blue-400/20 flex items-center justify-center mx-auto mb-5">
            <MailQuestion className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Forgot Password</h1>
          <p className="text-slate-400 mt-2">Enter your email to request a password reset link.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
              required
              disabled={isSubmitting}
            />
          </div>

          {message ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white transition-colors"
          >
            {isSubmitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
