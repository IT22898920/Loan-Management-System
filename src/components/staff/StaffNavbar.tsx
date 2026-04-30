'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Home, FileText, PlusCircle, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Profile } from '@/types';
import { logoutAction } from '@/app/actions/auth';

export default function StaffNavbar({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  const navItems = [
    { href: '/staff/dashboard', label: 'Home', icon: Home },
    { href: '/staff/loans/new', label: 'New Loan', icon: PlusCircle },
    { href: '/staff/report', label: 'Report', icon: FileText },
    { href: '/profile', label: 'Profile', icon: User },
  ];

  return (
    <>
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white border-b px-4 h-14 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-1 shrink-0">
            <Image src="/logo.jpg" alt="DIRIYALANKA" width={26} height={26} className="object-contain" />
          </div>
          <div>
            <p className="font-black text-xs text-gray-900 tracking-wide leading-none">DIRIYALANKA</p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5 truncate max-w-[140px]">{profile.full_name}</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 bg-gray-100 hover:bg-red-50 px-3 py-1.5 rounded-full transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </form>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-lg safe-area-inset">
        <div className="flex">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/staff/dashboard'
              ? pathname === href || pathname.startsWith('/staff/centers') || pathname.startsWith('/staff/members') || pathname.startsWith('/staff/payment')
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-[11px] font-medium transition-all',
                  active
                    ? 'text-primary'
                    : 'text-gray-400 hover:text-gray-600'
                )}
              >
                <div className={cn(
                  'p-1.5 rounded-xl transition-all',
                  active ? 'bg-primary/10' : ''
                )}>
                  <Icon className={cn('h-5 w-5', active ? 'stroke-[2.5]' : '')} />
                </div>
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
