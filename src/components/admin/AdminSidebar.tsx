'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard, Building2, Users, UserCog, Upload,
  CreditCard, FileText, LogOut, ChevronRight, Menu, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Profile } from '@/types';
import { logoutAction } from '@/app/actions/auth';

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/centers', label: 'Centers', icon: Building2 },
  { href: '/admin/members', label: 'Members', icon: Users },
  { href: '/admin/staff', label: 'Staff', icon: UserCog },
  { href: '/admin/import', label: 'Excel Import', icon: Upload },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/reports', label: 'Reports', icon: FileText },
];

function SidebarContent({ profile, onClose }: { profile: Profile; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo header */}
      <div className="px-5 pt-5 pb-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1.5 shrink-0">
            <Image src="/logo.jpg" alt="DIRIYALANKA" width={36} height={36} className="object-contain" />
          </div>
          <div>
            <h1 className="font-black text-sm text-gray-900 tracking-wide">DIRIYALANKA</h1>
            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{profile.full_name}</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 md:hidden">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
                active
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {active && <ChevronRight className="ml-auto h-3 w-3 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminSidebar({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b px-4 h-14 flex items-center justify-between shadow-sm">
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="DIRIYALANKA" width={28} height={28} className="object-contain" />
          <span className="font-black text-sm text-gray-900 tracking-wide">DIRIYALANKA</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent profile={profile} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r flex-col shadow-sm shrink-0">
        <SidebarContent profile={profile} />
      </aside>
    </>
  );
}
