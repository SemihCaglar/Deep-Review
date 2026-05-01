'use client';

import React, { createContext, useContext, useState } from 'react';
import { User } from '@/lib/mockData';
import { clearToken, type StoredAuthUser } from '@/lib/auth';

interface UserContextType {
    user: User;
    setUser: (user: User) => void;
    logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);
const EMPTY_USER: User = { id: '', name: '', isCoordinator: false, email: '' };
const AUTH_USER_KEY = 'bilsen_auth_user';
const LEGACY_USER_KEY = 'bilsen_user';

export function UserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User>(EMPTY_USER);
    const [mounted, setMounted] = useState(false);

    // Sync from localStorage after hydration
    React.useEffect(() => {
        setMounted(true);
        const authUser = readAuthUserFromStorage();

        if (authUser) {
            setUser(authUser);
            return;
        }

        const legacyUser = readLegacyUserFromStorage();
        setUser(legacyUser ?? EMPTY_USER);
    }, []);

    // Handle saving user to state and localStorage
    const handleSetUser = React.useCallback((newUser: User) => {
        setUser(newUser);
        if (typeof window !== 'undefined') {
            localStorage.setItem('bilsen_user', JSON.stringify(newUser));
        }
    }, []);

    const logout = React.useCallback(() => {
        clearToken();
        if (typeof window !== 'undefined') {
            localStorage.removeItem(AUTH_USER_KEY);
            localStorage.removeItem(LEGACY_USER_KEY);
        }
        handleSetUser(EMPTY_USER);
    }, [handleSetUser]);

    const contextValue = React.useMemo(
        () => ({ user, setUser: handleSetUser, logout }),
        [handleSetUser, logout, user],
    );

    // Prevent rendering children until mounted to avoid hydration flash entirely
    if (!mounted) {
        return null;
    }

    return (
        <UserContext.Provider value={contextValue}>
            {children}
        </UserContext.Provider>
    );
}

function readAuthUserFromStorage(): User | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const rawAuthUser = localStorage.getItem(AUTH_USER_KEY);
    if (!rawAuthUser) {
        return null;
    }

    try {
        const parsedUser = JSON.parse(rawAuthUser) as StoredAuthUser;
        return {
            id: parsedUser.id,
            name: parsedUser.name,
            email: parsedUser.email,
            isCoordinator: parsedUser.role === 'Coordinator',
            isAdmin: parsedUser.role === 'Admin',
            labs: parsedUser.labs || [],
        };
    } catch (e) {
        console.error('Failed to parse auth user from localStorage', e);
        localStorage.removeItem(AUTH_USER_KEY);
        return null;
    }
}

function readLegacyUserFromStorage(): User | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const rawLegacyUser = localStorage.getItem(LEGACY_USER_KEY);
    if (!rawLegacyUser) {
        return null;
    }

    try {
        return JSON.parse(rawLegacyUser) as User;
    } catch (e) {
        console.error('Failed to parse legacy user from localStorage', e);
        localStorage.removeItem(LEGACY_USER_KEY);
        return null;
    }
}

export function useUser() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
}
