'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/components/context/UserContext';
import { Home, FileText, CheckCircle, LogOut, PlusSquare, UserCheck, Users, Shield, ClipboardList } from 'lucide-react';
import ProfileModal from './ProfileModal';

export default function Sidebar() {
    const { user, logout } = useUser();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [isProfileOpen, setIsProfileOpen] = React.useState(false);

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const getNavItems = () => {
            if (user.isAdmin) {
            return [
                { name: 'My Dashboard', href: '/dashboard', icon: Home },
                { name: 'Admin Dashboard', href: '/admin', icon: Shield },
            ];
        }

        const base = [
            { name: 'My Dashboard', href: '/dashboard', icon: Home },
            { name: 'Lab Members', href: '/lab-members', icon: Users },
            ...(user.isCoordinator ? [{ name: 'Pending Approvals', href: '/pending-approvals', icon: UserCheck }] : []),
        ];

        if (!user.isCoordinator) {
            base.push({ name: 'My Authored Papers', href: '/papers?filter=authored', icon: FileText });
            base.push({ name: 'My Assigned Reviews', href: '/my-reviews', icon: CheckCircle });
            base.push({ name: 'Register Paper', href: '/register', icon: PlusSquare });
        } else {
            base.push({ name: 'All Papers (System)', href: '/papers', icon: FileText });
            base.push({ name: 'Register Paper', href: '/register', icon: PlusSquare });
            base.push({ name: 'Round Management', href: '/rounds', icon: ClipboardList });
        }

        return base;
    };

    const navItems = getNavItems();

    return (
        <aside className="w-64 border-r border-[#ffffff1a] glass flex flex-col pt-6 pb-4">
            <div className="px-6 mb-8">
                <h1 className="text-xl font-bold tracking-tight text-white">BILSEN</h1>
                <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Review System</p>
            </div>

            <div className="px-4 mb-8">
                <button
                    type="button"
                    onClick={() => setIsProfileOpen(true)}
                    className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-blue-400/30 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    aria-label="Open profile"
                >
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-semibold text-sm border border-blue-500/20">
                        {user.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                            {user.isAdmin ? 'Admin' : user.isCoordinator ? 'Coordinator' : 'Standard User'}
                        </p>
                    </div>
                </button>
            </div>

            <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const authoredFilter = searchParams.get('filter');
                    let isActive = false;

                    if (item.href === '/dashboard') {
                        isActive = pathname === '/dashboard';
                    } else if (item.href === '/lab-members') {
                        isActive = pathname === '/lab-members';
                    } else if (item.href === '/pending-approvals') {
                        isActive = pathname === '/pending-approvals';
                    } else if (item.href === '/papers?filter=authored') {
                        isActive = pathname === '/papers' && authoredFilter === 'authored';
                    } else if (item.href === '/my-reviews') {
                        isActive = pathname === '/my-reviews';
                    } else if (item.href === '/papers') {
                        isActive = pathname === '/papers' && !authoredFilter;
                    } else if (item.href === '/register') {
                        isActive = pathname === '/register';
                    } else if (item.href === '/admin') {
                        isActive = pathname === '/admin' || pathname.startsWith('/admin/');
                    } else if (item.href === '/rounds') {
                        isActive = pathname === '/rounds' || pathname.startsWith('/rounds/');
                    }

                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? 'bg-blue-600/10 text-blue-400'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                }`}
                        >
                            <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            <div className="px-4 mt-auto pt-4 border-t border-white/5">
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    Log out
                </button>
            </div>

            {isProfileOpen ? <ProfileModal onClose={() => setIsProfileOpen(false)} /> : null}
        </aside>
    );
}
