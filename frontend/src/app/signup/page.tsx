'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { ApiError, signupRequest, getLabsRequest, type Lab } from '@/lib/api';

export default function SignupPage() {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [labId, setLabId] = React.useState('');
  const [labs, setLabs] = React.useState<Lab[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    getLabsRequest()
      .then(setLabs)
      .catch(err => console.error('Failed to load labs:', err));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!labId) {
      setError('Please select your lab.');
      return;
    }

    setIsSubmitting(true);

    try {
      await signupRequest(name, email, password, labId || undefined);
      setSuccessMessage('Your account request has been submitted and is pending coordinator approval.');
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setLabId('');
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : 'Failed to submit signup request.');
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

      <div className="glass rounded-2xl border border-white/5 p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />

        <div className="text-center mb-8 relative">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/15 text-blue-300 border border-blue-400/20 flex items-center justify-center mx-auto mb-5">
            <UserPlus className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-3 text-white">Sign Up</h1>
          <p className="text-slate-400">Create your BILSEN account request for coordinator approval.</p>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              Full Name
            </label>
            <input
              id="name"
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="Your full name"
              disabled={isSubmitting}
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
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="you@example.com"
              disabled={isSubmitting}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="Create a password"
              disabled={isSubmitting}
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="Confirm your password"
              disabled={isSubmitting}
              required
            />
          </div>

          <div>
            <label htmlFor="labId" className="block text-sm font-medium text-slate-300 mb-2">
              Select Lab
            </label>
            <select
              id="labId"
              value={labId}
              onChange={event => setLabId(event.target.value)}
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              disabled={isSubmitting || labs.length === 0}
              required
            >
              <option value="">-- Select Your Lab --</option>
              {labs.map(lab => (
                <option key={lab.id} value={lab.id}>
                  {lab.name}
                </option>
              ))}
            </select>
          </div>

          {successMessage ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {successMessage}
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
            {isSubmitting ? 'Submitting...' : 'Submit Signup Request'}
          </button>

          <div className="text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
