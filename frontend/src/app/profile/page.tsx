'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { PROFILE_MODAL_PARAM } from '@/lib/profileReturn';

export default function ProfilePage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace(`/dashboard?${PROFILE_MODAL_PARAM}=1`);
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="glass rounded-2xl border border-white/5 p-8">
        <p className="text-sm text-slate-400">Opening profile...</p>
      </div>
    </div>
  );
}
