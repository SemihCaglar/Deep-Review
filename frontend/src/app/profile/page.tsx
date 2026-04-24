'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, PencilLine, Tags, UserCircle2 } from 'lucide-react';
import { getStoredUser } from '@/lib/auth';
import { MOCK_PAPERS } from '@/lib/mockData';

export default function ProfilePage() {
  const router = useRouter();
  const [storedUser, setStoredUser] = React.useState(getStoredUser());

  React.useEffect(() => {
    const user = getStoredUser();
    setStoredUser(user);

    if (!user) {
      router.replace('/login');
    }
  }, [router]);

  if (!storedUser) {
    return null;
  }

  const authoredPapers = MOCK_PAPERS.filter(paper => paper.authors.includes(storedUser.id));

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Profile</h1>
          <p className="text-slate-400 mt-2">View your account details and keep your interests up to date.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/profile/edit"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <PencilLine className="w-4 h-4" />
            Update Profile
          </Link>
          <Link
            href="/profile/change-password"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            Change Password
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 text-blue-300 border border-blue-400/20 flex items-center justify-center">
              <UserCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{storedUser.name}</h2>
              <p className="text-sm text-slate-400">{storedUser.email}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Full Name</p>
              <p className="text-slate-100 font-medium">{storedUser.name}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Email</p>
              <p className="text-slate-100 font-medium">{storedUser.email}</p>
            </div>
          </div>
        </section>

        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Tags className="w-5 h-5 text-blue-300" />
            <h2 className="text-lg font-semibold text-white">Topic Interests</h2>
          </div>

          {storedUser.interests?.length ? (
            <div className="flex flex-wrap gap-2">
              {storedUser.interests.map(topic => (
                <span
                  key={topic.id}
                  className="px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-sm text-blue-200"
                >
                  {topic.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No topic interests selected yet.</p>
          )}
        </section>
      </div>

      {authoredPapers.length ? (
        <section className="glass rounded-2xl border border-white/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Authored Papers</h2>
              <p className="text-sm text-slate-400">Quick view of papers already visible in the current UI data.</p>
            </div>
            <Link href="/papers?filter=authored" className="text-sm text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
              Open papers
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-3">
            {authoredPapers.map(paper => (
              <div key={paper.id} className="rounded-xl border border-white/10 bg-background/60 p-4">
                <p className="font-medium text-white">{paper.title}</p>
                <p className="text-sm text-slate-400 mt-1">{paper.status}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
