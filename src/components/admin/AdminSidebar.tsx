'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard, Building2, Users, UserCog, Upload,
  CreditCard, FileText, LogOut, ChevronRight, Menu, X,
  PanelLeftClose, PanelLeftOpen
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

function SidebarContent({
  profile, onClose, collapsed = false, onToggle,
}: {
  profile: Profile;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo header */}
      <div className={cn('border-b', collapsed ? 'px-2 pt-4 pb-3' : 'px-5 pt-5 pb-4')}>
        <div className={cn('flex', collapsed ? 'flex-col items-center gap-2' : 'items-center justify-between')}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1.5 shrink-0">
              <Image src="/logo.jpg" alt="DIRIYALANKA" width={collapsed ? 28 : 36} height={collapsed ? 28 : 36} className="object-contain" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="font-black text-sm text-gray-900 tracking-wide">DIRIYALANKA</h1>
                <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{profile.full_name}</p>
              </div>
            )}
          </div>

          {/* Desktop collapse / expand toggle */}
          {onToggle && (
            <button
              onClick={onToggle}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
          )}

          {/* Mobile close */}
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 md:hidden shrink-0">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <nav className={cn('flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden', collapsed ? 'p-2' : 'p-3')}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center rounded-xl text-sm transition-all',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && active && <ChevronRight className="ml-auto h-3 w-3 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      <div className={cn('border-t', collapsed ? 'p-2' : 'p-3')}>
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? 'Sign Out' : undefined}
            className={cn(
              'flex items-center rounded-xl text-sm text-red-600 hover:bg-red-50 w-full transition-colors',
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && 'Sign Out'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminSidebar({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);        // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop rail

  // Restore desktop collapsed preference
  useEffect(() => {
    if (localStorage.getItem('admin-sidebar-collapsed') === '1') setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('admin-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b px-4 h-14 flex items-center justify-between shadow-sm">
        <button onClick={() => setOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
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
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <SidebarContent profile={profile} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar (collapsible) */}
      <aside
        className={cn(
          'hidden md:flex bg-white border-r flex-col shadow-sm shrink-0 transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarContent profile={profile} collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>
    </>
  );
}
