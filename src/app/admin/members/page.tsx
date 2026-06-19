'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Users, ArrowRight, Search, Download, FileText, X, Loader2, AlertTriangle, MinusCircle, Flame } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { generateMembersPDF, MemberPDFRow } from '@/lib/pdf-report';

interface MemberRow {
  id: string;
  member_number: string;
  full_name: string;
  created_at: string;
  center: { id: string; name: string; center_number: number } | null;
  loans: { id: string; loan_plan: number | null; principal: number | null; loan_balance: number; status: string; issued_date: string }[];
}

const COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-cyan-500','bg-rose-500','bg-teal-500'];

export default function MembersPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'none' | 'alert' | 'critical'>('all');
  const [alertByLoan, setAlertByLoan] = useState<Map<string, 'np' | 'shortfall'>>(new Map());
  const [criticalLoanIds, setCriticalLoanIds] = useState<Set<string>>(new Set());
  const [dayFilter, setDayFilter] = useState<'all' | 'monday' | 'tuesday' | 'wednesday' | 'thursday'>('all');
  const [centerDayMap, setCenterDayMap] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      // Paginate members — PostgREST caps a single select at 1000 rows (there are 2,179 members)
      const allMembers: MemberRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('members')
          .select(`id, member_number, full_name, created_at, center:centers(id, name, center_number), loans(id, loan_plan, principal, loan_balance, status, issued_date)`)
          .order('member_number')
          .range(from, from + PAGE - 1);
        if (error) { toast.error('Failed to load members.'); break; }
        if (!data || data.length === 0) break;
        allMembers.push(...(data as unknown as MemberRow[]));
        if (data.length < PAGE) break;
      }
      setMembers(allMembers);

      // Per-loan alert/critical flags computed server-side from EACH active
      // loan's own most-recent 3 payments (window-function RPC) — correct at
      // 319k-payment scale, where a global "last 600" covered ~one day.
      const [{ data: flags }, { data: assignments }] = await Promise.all([
        supabase.rpc('member_loan_flags'),
        supabase
          .from('staff_center_assignments')
          .select('center_id, day_of_week'),
      ]);

      const alertMap = new Map<string, 'np' | 'shortfall'>();
      const critical = new Set<string>();
      for (const f of (flags ?? []) as { loan_id: string; alert: string | null; critical: boolean }[]) {
        if (f.alert === 'np' || f.alert === 'shortfall') alertMap.set(f.loan_id, f.alert);
        if (f.critical) critical.add(f.loan_id);
      }
      setAlertByLoan(alertMap);

      // Build centerDayMap from staff_center_assignments
      const cdm = new Map<string, Set<string>>();
      for (const a of (assignments ?? []) as { center_id: string; day_of_week: string }[]) {
        if (!cdm.has(a.center_id)) cdm.set(a.center_id, new Set());
        cdm.get(a.center_id)!.add(a.day_of_week);
      }
      setCenterDayMap(cdm);

      setCriticalLoanIds(critical);
      setLoading(false);
    })();
  }, []);

  function getMemberCritical(m: MemberRow): boolean {
    return m.loans.filter(l => l.status === 'active').some(l => criticalLoanIds.has(l.id));
  }

  function getMemberAlerts(m: MemberRow): { np: boolean; shortfall: boolean } {
    let np = false, shortfall = false;
    for (const loan of m.loans.filter(l => l.status === 'active')) {
      const a = alertByLoan.get(loan.id);
      if (a === 'np') np = true;
      else if (a === 'shortfall') shortfall = true;
    }
    return { np, shortfall };
  }

  // "Joined" = earliest loan issue date from the sheet (created_at is only the import date)
  function memberSince(m: MemberRow): string {
    const dates = m.loans.map(l => l.issued_date).filter(Boolean).sort();
    return dates[0] ?? m.created_at.split('T')[0];
  }

  function getMemberAlert(m: MemberRow): 'np' | 'shortfall' | null {
    const { np, shortfall } = getMemberAlerts(m);
    if (np) return 'np';
    if (shortfall) return 'shortfall';
    return null;
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    const result = members.filter((m) => {
      const matchesSearch = !q
        || m.full_name.toLowerCase().includes(q)
        || m.member_number.toLowerCase().includes(q)
        || (m.center?.name ?? '').toLowerCase().includes(q);

      const activeLoans = m.loans.filter(l => l.status === 'active');
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && activeLoans.length > 0) ||
        (statusFilter === 'none' && activeLoans.length === 0) ||
        (statusFilter === 'alert' && getMemberAlert(m) !== null) ||
        (statusFilter === 'critical' && getMemberCritical(m));

      const matchesDay = dayFilter === 'all' ||
        (m.center?.id ? centerDayMap.get(m.center.id)?.has(dayFilter) ?? false : false);

      return matchesSearch && matchesStatus && matchesDay;
    });

    // Sort: Critical → N/P → Shortfall → Normal
    return result.sort((a, b) => {
      const order = (m: MemberRow) => {
        if (getMemberCritical(m)) return 0;
        const al = getMemberAlert(m);
        return al === 'np' ? 1 : al === 'shortfall' ? 2 : 3;
      };
      return order(a) - order(b);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, search, statusFilter, dayFilter, alertByLoan, criticalLoanIds, centerDayMap]);

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const q = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'Member #',
      'Full Name',
      'Center Name',
      'Center #',
      'Active Loans',
      'Active Plans',
      'L Issued Date(s)',
      'Total Loan Balance (LKR)',
      'Completed Loans',
      'Joined Date',
    ];

    const rows = filtered.map((m) => {
      const activeLoans = m.loans.filter(l => l.status === 'active');
      const completedLoans = m.loans.filter(l => l.status === 'completed');
      const plans = activeLoans.map(l => l.principal ? `${Math.round(l.principal / 1000)}K` : '—').join(' | ');
      const issuedDates = activeLoans.map(l => l.issued_date).join(' | ');
      const totalLB = activeLoans.reduce((s, l) => s + l.loan_balance, 0);
      return [
        m.member_number,
        q(m.full_name),
        q(m.center?.name ?? ''),
        m.center?.center_number ?? '',
        activeLoans.length,
        q(plans || 'None'),
        q(issuedDates || '—'),
        totalLB.toFixed(2),
        completedLoans.length,
        memberSince(m),
      ];
    });

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `members-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── PDF Export ────────────────────────────────────────────────────────────
  function exportPDF() {
    const pdfRows: MemberPDFRow[] = filtered.map((m) => {
      const activeLoans = m.loans.filter(l => l.status === 'active');
      const plans = activeLoans.map(l => l.principal ? `${Math.round(l.principal / 1000)}K` : '—').join(', ');
      const totalLB = activeLoans.reduce((s, l) => s + l.loan_balance, 0);
      return {
        member_number: m.member_number,
        full_name: m.full_name,
        center_name: m.center?.name ?? '—',
        active_plans: plans || 'None',
        loan_balance: totalLB,
        joined: memberSince(m),
      };
    });
    const filterLabel = statusFilter !== 'all' ? statusFilter : search ? `"${search}"` : undefined;
    generateMembersPDF(pdfRows, filterLabel);
  }

  const activeCount = filtered.filter(m => m.loans.some(l => l.status === 'active')).length;
  const noLoanCount = filtered.filter(m => !m.loans.some(l => l.status === 'active')).length;

  const alertCount = members.filter(m => getMemberAlert(m) !== null).length;
  const criticalCount = members.filter(m => getMemberCritical(m)).length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <p className="text-blue-200 text-sm font-medium mb-1">Management</p>
        <h1 className="text-2xl md:text-3xl font-bold">Members</h1>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-2xl">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Total</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : members.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Active Loan</p>
            <p className="text-xl font-bold mt-0.5 text-green-300">{loading ? '—' : activeCount}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">No Loan</p>
            <p className="text-xl font-bold mt-0.5 text-blue-200">{loading ? '—' : noLoanCount}</p>
          </div>
          <div className="bg-red-500/20 backdrop-blur-sm rounded-2xl p-3 border border-red-300/30">
            <p className="text-red-200 text-xs">Alerts</p>
            <p className="text-xl font-bold mt-0.5 text-red-300">{loading ? '—' : alertCount}</p>
          </div>
          <div className="bg-orange-500/30 backdrop-blur-sm rounded-2xl p-3 border border-orange-300/40">
            <p className="text-orange-200 text-xs flex items-center gap-1"><Flame className="h-3 w-3" />Critical</p>
            <p className="text-xl font-bold mt-0.5 text-orange-300">{loading ? '—' : criticalCount}</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, member #, or center…"
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

          {/* Status filter */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm flex-wrap overflow-x-auto">
            {(['all', 'active', 'none', 'alert', 'critical'] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setStatusFilter(v); if (v !== 'alert') setDayFilter('all'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                  v === 'critical'
                    ? statusFilter === v
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-orange-600 hover:text-orange-700 hover:bg-orange-50'
                    : v === 'alert'
                    ? statusFilter === v
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'text-red-500 hover:text-red-700 hover:bg-red-50'
                    : statusFilter === v
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v === 'critical' && <Flame className="h-3 w-3" />}
                {v === 'alert' && <AlertTriangle className="h-3 w-3" />}
                {v === 'all' ? 'All'
                  : v === 'active' ? 'Active Loan'
                  : v === 'none' ? 'No Loan'
                  : v === 'alert' ? `N/P & Shortfall${alertCount > 0 ? ` (${alertCount})` : ''}`
                  : `Critical${criticalCount > 0 ? ` (${criticalCount})` : ''}`}
              </button>
            ))}
          </div>

          {/* Export buttons */}
          <div className="flex gap-2 lg:ml-auto [&>*]:flex-1 sm:[&>*]:flex-none [&>*]:justify-center">
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium shadow-sm hover:bg-gray-50 disabled:opacity-40 transition-all"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          <button
            onClick={exportPDF}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium shadow-sm hover:bg-gray-50 disabled:opacity-40 transition-all"
          >
            <FileText className="h-4 w-4" /> PDF
          </button>
          <Link
            href="/admin/members/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:bg-primary/90 transition-all whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> Add Member
          </Link>
          </div>
        </div>

        {/* Day sub-filter — shown only when N/P & Shortfall is active */}
        {statusFilter === 'alert' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-400" /> Filter by day:
            </span>
            <div className="flex gap-1 bg-white border border-red-100 rounded-xl p-1 shadow-sm">
              {(['all', 'monday', 'tuesday', 'wednesday', 'thursday'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDayFilter(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    dayFilter === d
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {d === 'all' ? 'All Days' : d === 'monday' ? 'Mon' : d === 'tuesday' ? 'Tue' : d === 'wednesday' ? 'Wed' : 'Thu'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Result count */}
        {(search || statusFilter !== 'all') && (
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-gray-900">{filtered.length}</span> of {members.length} members
          </p>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{members.length === 0 ? 'No members yet' : 'No results found'}</p>
            <p className="text-sm mt-1">{members.length === 0 ? 'Add your first member or import from Excel.' : 'Try a different search or filter.'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Member</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Center</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Active Loans</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Total L/B</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Joined</th>
                    <th className="px-5 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((member, i) => {
                    const activeLoans = member.loans.filter(l => l.status === 'active');
                    const totalLB = activeLoans.reduce((s, l) => s + l.loan_balance, 0);
                    const isCritical = getMemberCritical(member);
                    const hasNP = !isCritical && activeLoans.some(l => alertByLoan.get(l.id) === 'np');
                    const hasShortfall = !isCritical && activeLoans.some(l => alertByLoan.get(l.id) === 'shortfall');
                    const memberAlert = hasNP ? 'np' : hasShortfall ? 'shortfall' : null;
                    return (
                      <tr key={member.id} className={`hover:bg-gray-50/50 transition-colors group ${
                        isCritical ? 'bg-orange-50/60' :
                        memberAlert === 'np' ? 'bg-red-50/40' :
                        memberAlert === 'shortfall' ? 'bg-amber-50/40' : ''
                      }`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl ${isCritical ? 'bg-orange-500' : COLORS[i % COLORS.length]} flex items-center justify-center text-white font-bold text-sm shrink-0 ${isCritical ? 'ring-2 ring-orange-300 ring-offset-1' : ''}`}>
                              {isCritical ? <Flame className="h-4 w-4" /> : member.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-gray-900">{member.full_name}</p>
                                {isCritical && (
                                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[10px] font-bold border border-orange-200">
                                    <Flame className="h-2.5 w-2.5" /> CRITICAL
                                  </span>
                                )}
                                {hasNP && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-bold">
                                    <MinusCircle className="h-2.5 w-2.5" /> N/P
                                  </span>
                                )}
                                {hasShortfall && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold">
                                    <AlertTriangle className="h-2.5 w-2.5" /> Shortfall
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">#{member.member_number}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {member.center ? `${member.center.name} (#${member.center.center_number})` : '—'}
                        </td>
                        <td className="px-5 py-4">
                          {activeLoans.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No active loans</span>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {activeLoans.map((loan) => {
                                const loanAlert = alertByLoan.get(loan.id);
                                return (
                                  <div key={loan.id} className="flex items-center gap-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
                                      {loan.principal ? `${Math.round(loan.principal / 1000)}K` : '—'}
                                    </span>
                                    {loan.issued_date && (
                                      <span className="text-[11px] text-muted-foreground">{loan.issued_date}</span>
                                    )}
                                    {loanAlert === 'np' && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-bold">
                                        <MinusCircle className="h-2.5 w-2.5" /> N/P
                                      </span>
                                    )}
                                    {loanAlert === 'shortfall' && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold">
                                        <AlertTriangle className="h-2.5 w-2.5" /> Shortfall
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                          {totalLB > 0 ? formatCurrency(totalLB) : '—'}
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(memberSince(member))}
                        </td>
                        <td className="px-5 py-4">
                          <Link
                            href={`/admin/members/${member.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                          >
                            View <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
