import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency, formatDate, getTodayString } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, Users, Building2, AlertTriangle,
  CreditCard, ArrowRight, CheckCircle2, XCircle,
  UserCog, Upload, FileText
} from 'lucide-react';
import CollectionChart from '@/components/admin/CollectionChart';

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const today = getTodayString();

  const [
    activeLoansRes,
    todayPaymentsRes,
    totalMembersRes,
    totalCentersRes,
    shortfallPaymentsRes,
    staffCollectionRes,
    activeLoanStatsRes,
    completedLoansTodayRes,
    allTimeCollectedRes,
    weeklyPaymentsRes,
  ] = await Promise.all([
    supabase.from('loans').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('payments').select('amount_paid, is_not_paid').eq('payment_date', today),
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('centers').select('*', { count: 'exact', head: true }),
    supabase.from('payments')
      .select('shortfall, member:members(full_name), loan:loans(principal)')
      .gt('shortfall', 0).eq('payment_date', today).limit(8),
    supabase.from('payments')
      .select('amount_paid, is_not_paid, staff:profiles(full_name)')
      .eq('payment_date', today),
    supabase.rpc('active_loan_stats'),
    supabase.from('loans')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed'),
    supabase.rpc('total_collected'),
    supabase.from('payments').select('amount_paid, is_not_paid, payment_date')
      .gte('payment_date', (() => {
        const d = new Date(today); d.setDate(d.getDate() - 6);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      })())
      .lte('payment_date', today),
  ]);

  // Surface query failures instead of silently rendering zeros.
  const failures: string[] = [];
  if (activeLoansRes.error) failures.push('active loans');
  if (todayPaymentsRes.error) failures.push("today's payments");
  if (totalMembersRes.error) failures.push('member count');
  if (totalCentersRes.error) failures.push('center count');
  if (shortfallPaymentsRes.error) failures.push('shortfall alerts');
  if (staffCollectionRes.error) failures.push('staff collection');
  if (activeLoanStatsRes.error) failures.push('active loan stats');
  if (completedLoansTodayRes.error) failures.push('completed loans');
  if (allTimeCollectedRes.error) failures.push('all-time collected');
  if (weeklyPaymentsRes.error) failures.push('weekly chart');

  const activeLoans = activeLoansRes.count;
  const todayPayments = todayPaymentsRes.data;
  const totalMembers = totalMembersRes.count;
  const totalCenters = totalCentersRes.count;
  const shortfallPayments = shortfallPaymentsRes.data;
  const staffCollection = staffCollectionRes.data;
  const activeLoanStats = activeLoanStatsRes.data;
  const completedLoansToday = completedLoansTodayRes.count;
  const allTimeCollected = allTimeCollectedRes.data;
  const weeklyPayments = weeklyPaymentsRes.data;

  const todayTotal = (todayPayments ?? []).reduce((s, p) => s + (p.is_not_paid ? 0 : p.amount_paid), 0);
  const allTimeTotal = Number(allTimeCollected ?? 0);
  // compact LKR (no decimals) for the hero stat cards so big totals fit
  const lkr = (n: number) => `LKR ${Math.round(n).toLocaleString('en-LK')}`;
  const todayPaidCount = (todayPayments ?? []).filter(p => !p.is_not_paid).length;
  const todayNPCount = (todayPayments ?? []).filter(p => p.is_not_paid).length;

  // Staff performance today
  const staffMap = new Map<string, number>();
  for (const p of staffCollection ?? []) {
    const name = (p.staff as unknown as { full_name: string } | null)?.full_name ?? 'Unknown';
    const paid = (p as unknown as { is_not_paid: boolean }).is_not_paid ? 0 : p.amount_paid;
    staffMap.set(name, (staffMap.get(name) ?? 0) + paid);
  }
  const staffPerformance = [...staffMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Active loans by principal size + total outstanding (via SQL fn — avoids the 1000-row cap)
  const als = (activeLoanStats ?? {}) as { outstanding?: number; small?: number; medium?: number; large?: number };
  const sizeBuckets = { small: als.small ?? 0, medium: als.medium ?? 0, large: als.large ?? 0 };
  const totalOutstanding = Number(als.outstanding ?? 0);

  // Last 7 days chart data
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    const amount = (weeklyPayments ?? [])
      .filter((p: { payment_date: string; is_not_paid: boolean }) => p.payment_date === dateStr && !p.is_not_paid)
      .reduce((s: number, p: { amount_paid: number }) => s + p.amount_paid, 0);
    return { label, amount };
  });

  const quickActions = [
    { href: '/admin/members/new', label: 'Add Member', icon: Users, color: 'bg-blue-500' },
    { href: '/admin/staff/new', label: 'Add Staff', icon: UserCog, color: 'bg-violet-500' },
    { href: '/admin/import', label: 'Excel Import', icon: Upload, color: 'bg-emerald-500' },
    { href: '/admin/reports', label: 'View Reports', icon: FileText, color: 'bg-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="px-4 md:px-8 py-6 md:py-8">
          <p className="text-blue-200 text-sm font-medium mb-1">{formatDate(today)}</p>
          <h1 className="text-2xl md:text-3xl font-bold">Overview</h1>
          <p className="text-blue-200 text-sm mt-1">Loan Management System — Admin Panel</p>

          {/* Hero stats */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 [&>div]:min-w-0">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
              <p className="text-blue-200 text-xs font-medium">Today&apos;s Collection</p>
              <p className="text-xl xl:text-2xl font-bold mt-1 leading-tight break-words tabular-nums">{lkr(todayTotal)}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-blue-200">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-300" />{todayPaidCount} paid</span>
                <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-300" />{todayNPCount} N/P</span>
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
              <p className="text-blue-100 text-xs font-medium">Total Collection</p>
              <p className="text-xl xl:text-2xl font-bold mt-1 leading-tight break-words tabular-nums">{lkr(allTimeTotal)}</p>
              <p className="text-xs text-blue-200 mt-2">All-time repayments</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
              <p className="text-blue-200 text-xs font-medium">Active Loans</p>
              <p className="text-xl xl:text-2xl font-bold mt-1 leading-tight tabular-nums">{activeLoans ?? 0}</p>
              <p className="text-xs text-blue-200 mt-2">{(completedLoansToday ?? 0)} completed total</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
              <p className="text-blue-200 text-xs font-medium">Total Members</p>
              <p className="text-xl xl:text-2xl font-bold mt-1 leading-tight tabular-nums">{totalMembers ?? 0}</p>
              <p className="text-xs text-blue-200 mt-2">Registered borrowers</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
              <p className="text-blue-200 text-xs font-medium">Centers</p>
              <p className="text-xl xl:text-2xl font-bold mt-1 leading-tight tabular-nums">{totalCenters ?? 0}</p>
              <p className="text-xs text-blue-200 mt-2">Active centers</p>
            </div>
            <div className="bg-amber-500/20 backdrop-blur-sm rounded-2xl p-4 border border-amber-300/30">
              <p className="text-amber-100 text-xs font-medium">Outstanding</p>
              <p className="text-xl xl:text-2xl font-bold mt-1 leading-tight break-words tabular-nums">{lkr(totalOutstanding)}</p>
              <p className="text-xs text-amber-200 mt-2">Total to collect</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">

        {/* Partial data warning */}
        {failures.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-800 text-sm">Some dashboard data could not be loaded</p>
              <p className="text-xs text-red-700 mt-1">Showing partial information. Failed: {failures.join(', ')}.</p>
            </div>
            <Link href="/admin/dashboard" className="text-xs font-medium text-red-700 hover:underline shrink-0">Refresh</Link>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map(({ href, label, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group"
              >
                <div className={`${color} p-2.5 rounded-xl`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 ml-auto transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Weekly Collection Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Weekly Collection</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Last 7 days</p>
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="px-5 py-4">
            <CollectionChart data={chartData} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Staff Performance Today */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Today&apos;s Staff Performance</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Collection by staff member</p>
              </div>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="p-5">
              {staffPerformance.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No collections yet today</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {staffPerformance.map(([name, amount], i) => {
                    const pct = todayTotal > 0 ? Math.round((amount / todayTotal) * 100) : 0;
                    const colors = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500'];
                    return (
                      <div key={name}>
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={`w-7 h-7 rounded-full ${colors[i % colors.length]} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-gray-800 truncate">{name}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 shrink-0">{formatCurrency(amount)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colors[i % colors.length]} rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Loan Plan Breakdown */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Loan Sizes</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Active loans by principal</p>
              </div>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: '≤ Rs. 10K', count: sizeBuckets.small, weekly: 'Small loans', color: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-700' },
                { label: 'Rs. 10K – 25K', count: sizeBuckets.medium, weekly: 'Mid-size loans', color: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700' },
                { label: '> Rs. 25K', count: sizeBuckets.large, weekly: 'Large loans', color: 'bg-violet-500', light: 'bg-violet-50', text: 'text-violet-700' },
              ].map(({ label, count, weekly, color, light, text }) => (
                <div key={label} className={`${light} rounded-xl p-4 flex items-center justify-between`}>
                  <div>
                    <p className={`font-semibold ${text} text-sm`}>{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{weekly}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${text}`}>{count}</p>
                    <p className="text-xs text-gray-400">loans</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 pb-5">
              <Link
                href="/admin/members"
                className="flex items-center justify-center gap-2 text-sm text-primary font-medium hover:underline"
              >
                View all members <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Shortfall Alerts */}
        {shortfallPayments && shortfallPayments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-50 bg-amber-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-100 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-amber-900">Shortfall Alerts</h2>
                  <p className="text-xs text-amber-600 mt-0.5">{shortfallPayments.length} members paid less than expected today</p>
                </div>
              </div>
              <Link href="/admin/payments" className="text-xs text-amber-700 hover:underline font-medium flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {shortfallPayments.map((p, i) => {
                const member = p.member as unknown as { full_name: string } | null;
                const loan = p.loan as unknown as { principal: number | null } | null;
                const planLabel = loan?.principal ? `${Math.round(loan.principal / 1000)}K` : '—';
                return (
                  <div key={i} className="px-5 py-3 flex items-center justify-between gap-2 hover:bg-gray-50/50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold shrink-0">
                        {member?.full_name?.charAt(0) ?? '?'}
                      </div>
                      <span className="text-sm font-medium text-gray-800 truncate">{member?.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs text-gray-500">{planLabel}</Badge>
                      <Badge variant="warning" className="text-xs">
                        -{formatCurrency(p.shortfall)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No shortfalls today */}
        {(!shortfallPayments || shortfallPayments.length === 0) && todayPaidCount > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-emerald-800">No shortfalls today!</p>
              <p className="text-sm text-emerald-600 mt-0.5">All {todayPaidCount} payments collected in full.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
