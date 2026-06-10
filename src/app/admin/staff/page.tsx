'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, UserCog, CalendarDays, ArrowRight, Search, X, Loader2, Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DAYS_OF_WEEK } from '@/types';

interface StaffRow {
  id: string;
  full_name: string;
  email: string;
  staff_center_assignments: {
    day_of_week: string;
    center: { name: string } | null;
  }[];
}

const COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-cyan-500'];

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('profiles')
      .select(`id, full_name, email, staff_center_assignments(day_of_week, center:centers(name))`)
      .eq('role', 'staff')
      .order('full_name')
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load staff.');
        setStaff((data ?? []) as unknown as StaffRow[]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return staff;
    return staff.filter(
      (s) => s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [staff, search]);

  const totalAssigned = staff.reduce((sum, s) => sum + (s.staff_center_assignments?.length ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <p className="text-blue-200 text-sm font-medium mb-1">Management</p>
        <h1 className="text-2xl md:text-3xl font-bold">Staff Members</h1>
        <div className="mt-4 grid grid-cols-3 gap-3 max-w-xs">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Total Staff</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : staff.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Showing</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : filtered.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Assignments</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : totalAssigned}</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-4">
        {/* Toolbar */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Link
            href="/admin/staff/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:bg-primary/90 transition-all whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> Add Staff
          </Link>
        </div>

        {search && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-gray-900">{filtered.length}</span> of {staff.length} staff members
          </p>
        )}

        {/* Cards */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center text-muted-foreground">
            <UserCog className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{staff.length === 0 ? 'No staff members yet' : 'No results found'}</p>
            <p className="text-sm mt-1">{staff.length === 0 ? 'Add your first staff account to get started.' : 'Try a different search.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((member, i) => {
              const assignments = member.staff_center_assignments ?? [];
              const byDay = DAYS_OF_WEEK.map(({ value, label }) => ({
                day: value,
                label: label.split(' ')[0],
                centers: assignments
                  .filter((a) => a.day_of_week === value)
                  .map((a) => a.center?.name ?? '')
                  .filter(Boolean),
              }));
              const totalAsgn = byDay.reduce((s, d) => s + d.centers.length, 0);

              return (
                <div key={member.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${COLORS[i % COLORS.length]} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                        {member.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{member.full_name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/admin/staff/${member.id}/edit`}
                        title="Edit staff details"
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        href={`/admin/staff/${member.id}/assignments`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <CalendarDays className="h-3.5 w-3.5" /> Assign
                      </Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {byDay.map(({ day, label, centers }) => (
                      <div
                        key={day}
                        className={`rounded-xl p-2 text-center transition-colors ${
                          centers.length > 0 ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-300'
                        }`}
                      >
                        <p className="font-semibold text-xs">{label}</p>
                        {centers.length > 0 ? (
                          <p className="text-[10px] truncate mt-0.5 font-medium">{centers.join(', ')}</p>
                        ) : (
                          <p className="text-[10px] mt-0.5">—</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {totalAsgn} assignment{totalAsgn !== 1 ? 's' : ''} this week
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <Link href={`/admin/staff/${member.id}/edit`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-gray-700 transition-colors">
                        <Pencil className="h-3 w-3" /> Edit
                      </Link>
                      <Link href={`/admin/staff/${member.id}/assignments`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
                        Schedule <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
