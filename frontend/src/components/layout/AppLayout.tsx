'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import Sidebar from './Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoggingOut } = useUser();
    const pathname = usePathname();
    const isLoggedIn = user && user.id !== '';

    if (isLoggingOut && pathname !== '/login') {
        return <main className="min-h-screen bg-background text-foreground" />;
    }

    if (!isLoggedIn) {
        // If not logged in, just show children (the login page)
        return <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
            {children}
        </main>;
    }

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8 relative">
                {children}
            </main>
        </div>
    );
}
