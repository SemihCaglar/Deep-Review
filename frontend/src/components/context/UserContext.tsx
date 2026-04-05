'use client';

import React, { createContext, useContext, useState } from 'react';
import { User, MOCK_USERS } from '@/lib/mockData';

interface UserContextType {
    user: User;
    setUser: (user: User) => void;
    mockLogin: (userKey: keyof typeof MOCK_USERS) => void;
    logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
    // Default to coordinator for easy access (server render)
    const [user, setUser] = useState<User>(MOCK_USERS.coordinator);
    const [mounted, setMounted] = useState(false);

    // Sync from localStorage after hydration
    React.useEffect(() => {
        setMounted(true);
        const savedUser = localStorage.getItem('bilsen_user');
        if (savedUser) {
            try {
                setUser(JSON.parse(savedUser) as User);
            } catch (e) {
                console.error('Failed to parse user from localStorage', e);
            }
        }
    }, []);

    // Handle saving user to state and localStorage
    const handleSetUser = (newUser: User) => {
        setUser(newUser);
        if (typeof window !== 'undefined') {
            localStorage.setItem('bilsen_user', JSON.stringify(newUser));
        }
    };

    // Quick helper to switch users by their mock key
    const mockLogin = (userKey: keyof typeof MOCK_USERS) => {
        handleSetUser(MOCK_USERS[userKey]);
    };

    const logout = () => {
        handleSetUser({ id: '', name: '', isCoordinator: false, email: '' });
    };

    // Prevent rendering children until mounted to avoid hydration flash entirely
    if (!mounted) {
        return null;
    }

    return (
        <UserContext.Provider value={{ user, setUser: handleSetUser, mockLogin, logout }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
}
