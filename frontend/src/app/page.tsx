'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import { MOCK_USERS } from '@/lib/mockData';
import { Shield, User, Users } from 'lucide-react';

export default function LoginPage() {
  const { mockLogin, user } = useUser();
  const router = useRouter();

  React.useEffect(() => {
    if (user && user.id !== '') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleLogin = (role: keyof typeof MOCK_USERS) => {
    mockLogin(role);
    router.push('/dashboard');
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight mb-3 text-white">BILSEN System</h1>
        <p className="text-slate-400">Select a mock persona to enter the application</p>
      </div>

      <div className="w-full glass p-8 rounded-2xl shadow-2xl flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl"></div>

        <button
          onClick={() => handleLogin('coordinator')}
          className="relative group flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all overflow-hidden"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-white text-lg">Coordinator</h3>
              <p className="text-sm text-slate-400">{MOCK_USERS.coordinator.name}</p>
            </div>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 text-sm font-medium mr-2">Login &rarr;</div>
        </button>

        <button
          onClick={() => handleLogin('semih')}
          className="relative group flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all overflow-hidden"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-white text-lg">Standard User (Semih)</h3>
              <p className="text-sm text-slate-400">{MOCK_USERS.semih.name}</p>
            </div>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400 text-sm font-medium mr-2">Login &rarr;</div>
        </button>

        <button
          onClick={() => handleLogin('bob')}
          className="relative group flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all overflow-hidden"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-white text-lg">Standard User (Bob)</h3>
              <p className="text-sm text-slate-400">{MOCK_USERS.bob.name}</p>
            </div>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-purple-400 text-sm font-medium mr-2">Login &rarr;</div>
        </button>

      </div>
    </div>
  );
}
