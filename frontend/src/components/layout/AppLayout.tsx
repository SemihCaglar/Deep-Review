'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LabContextProvider, useLabContext } from '@/components/context/LabContext';
import { useUser } from '@/components/context/UserContext';
import Sidebar from './Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user } = useUser();
    const isLoggedIn = user && user.id !== '';

    if (!isLoggedIn) {
        // If not logged in, just show children (the login page)
        return <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
            {children}
        </main>;
    }

    return (
        <LabContextProvider>
            <LoggedInLayout>{children}</LoggedInLayout>
        </LabContextProvider>
    );
}

function LoggedInLayout({ children }: { children: React.ReactNode }) {
    const { user } = useUser();
    const { selectedLab } = useLabContext();
    const pathname = usePathname();
    const router = useRouter();

    React.useEffect(() => {
        const needsLabSelection = user.id && !user.isCoordinator && !user.isAdmin && !selectedLab && pathname !== '/lab-select';

        if (needsLabSelection) {
            router.replace('/lab-select');
        }
    }, [pathname, router, selectedLab, user.id, user.isAdmin, user.isCoordinator]);

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8 relative">
                {children}
            </main>
        </div>
    );
}
