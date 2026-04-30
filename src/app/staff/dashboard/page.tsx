import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Building2, TrendingUp, Calendar, ChevronRight, Users, CheckCircle2 } from 'lucide-react';
import { formatCurrency, getTodayString } from '@/lib/utils';
import { TODAY_DAY_OF_WEEK, DAYS_OF_WEEK } from '@/types';

export default async function StaffDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = getTodayString();
  const todayDay = TODAY_DAY_OF_WEEK();

  const { data: assignments } = todayDay
    ? await supabase
        .from('staff_center_assignments')
        .select('center:centers(id, name, center_number)')
        .eq('staff_id', user.id)
        .eq('day_of_week', todayDay)
    : { data: null };

  const centers = (assignments ?? [])
    .map((a) => a.center as unknown as { id: string; name: string; center_number: number } | null)
    .filter(Boolean) as { id: string; name: string; center_number: number }[];

  // Today's payments by this staff
  const { data: todayPayments } = await supabase
    .from('payments')
    .select('loan_id, amount_paid, is_not_paid')
    .eq('staff_id', user.id)
    .eq('payment_date', today);

  const paymentByLoan = new Map((todayPayments ?? []).map((p) => [p.loan_id, p]));

  // Per-center stats: fetch active loans for today's centers
  const centerIds = centers.map((c) => c.id);
  const { data: centerLoansWithPayment } = centerIds.length > 0
    ? await supabase
        .from('loans')
        .select('id, weekly_payment, member:members!inner(center_id)')
        .eq('status', 'active')
        .in('members.center_id', centerIds)
    : { data: null };

  const loansByCenterId: Record<string, string[]> = {};
  const expectedByCenterId: Record<string, number> = {};
  for (const loan of (centerLoansWithPayment ?? []) as unknown as { id: string; weekly_payment: number; member: { center_id: string } }[]) {
    const cid = loan.member.center_id;
    if (!loansByCenterId[cid]) loansByCenterId[cid] = [];
    loansByCenterId[cid].push(loan.id);
    expectedByCenterId[cid] = (expectedByCenterId[cid] ?? 0) + loan.weekly_payment;
  }

  const centerStats = centers.map((center) => {
    const loanIds = loansByCenterId[center.id] ?? [];
    const payments = loanIds.map((id) => paymentByLoan.get(id)).filter(Boolean) as { amount_paid: number; is_not_paid: boolean }[];
    const collected = payments.reduce((s, p) => s + (p.is_not_paid ? 0 : p.amount_paid), 0);
    const expected = expectedByCenterId[center.id] ?? 0;
    const done = payments.filter((p) => !p.is_not_paid).length;
    const np = payments.filter((p) => p.is_not_paid).length;
    return { ...center, collected, expected, done, np };
  });

  const todayExpected = centerStats.reduce((s, c) => s + c.expected, 0);

  const todayTotal = (todayPayments ?? []).reduce((s, p) => s + (p.is_not_paid ? 0 : p.amount_paid), 0);
  const paidCount = (todayPayments ?? []).filter(p => !p.is_not_paid).length;
  const npCount = (todayPayments ?? []).filter(p => p.is_not_paid).length;

  const dayLabel = todayDay
    ? DAYS_OF_WEEK.find((d) => d.value === todayDay)?.label ?? todayDay
    : null;

  return (
    <div className="pb-24">
      {/* Hero collection banner */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white -mx-4 px-4 pt-5 pb-6 mb-5">
        <div className="flex items-center gap-1.5 text-blue-300 text-xs mb-1">
          <Calendar className="h-3.5 w-3.5" />
          <span>{dayLabel ?? 'Non-working day'}</span>
        </div>
        <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-1">Today&apos;s Collection</p>

        <div className="flex items-end justify-between">
          <p className="text-4xl font-black">{formatCurrency(todayTotal)}</p>
          {todayExpected > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-blue-200 uppercase tracking-wide">Expected</p>
              <p className="font-bold text-lg text-blue-100">{formatCurrency(todayExpected)}</p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {todayExpected > 0 && (
          <div className="mt-3">
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round((todayTotal / todayExpected) * 100))}%` }}
              />
            </div>
            <p className="text-[10px] text-blue-200 mt-1">{Math.min(100, Math.round((todayTotal / todayExpected) * 100))}% of expected</p>
          </div>
        )}

        {/* Mini stats */}
        <div className="flex gap-3 mt-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-300" />
            <div>
              <p className="text-[10px] text-blue-200">Collected</p>
              <p className="font-bold text-sm">{paidCount}</p>
            </div>
          </div>
          {npCount > 0 && (
            <div className="bg-red-500/20 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-red-300/30 flex items-center gap-2">
              <Users className="h-4 w-4 text-red-300" />
              <div>
                <p className="text-[10px] text-red-200">Not Paid</p>
                <p className="font-bold text-sm text-red-200">{npCount}</p>
              </div>
            </div>
          )}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-200" />
            <div>
              <p className="text-[10px] text-blue-200">Centers</p>
              <p className="font-bold text-sm">{centers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Centers section */}
      <div className="space-y-3">
        <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wide px-1">
          Today&apos;s Centers
        </h2>

        {!todayDay ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <Calendar className="h-7 w-7 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-700">Non-working day</p>
            <p className="text-xs text-muted-foreground mt-1">Working days: Monday – Thursday</p>
          </div>
        ) : centers.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <Building2 className="h-7 w-7 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-700">No centers assigned</p>
            <p className="text-xs text-muted-foreground mt-1">Contact admin to assign centers for today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {centerStats.map((center, i) => (
              <Link key={center.id} href={`/staff/centers/${center.id}`}>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 flex items-center gap-4 hover:shadow-md active:scale-[0.99] transition-all cursor-pointer">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{center.name}</p>
                    <p className="text-xs text-muted-foreground">Center #{center.center_number}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-700">{formatCurrency(center.collected)}</p>
                      <p className="text-[10px] text-gray-400">
                        of {formatCurrency(center.expected)}
                        {center.done > 0 ? ` · ${center.done}${center.np > 0 ? `/${center.np}` : ''} done` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </Link>
            ))}

            {/* Done indicator if all collected */}
            {paidCount > 0 && (
              <div className="bg-green-50 rounded-2xl border border-green-100 px-5 py-3.5 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <p className="text-sm text-green-700 font-medium">
                  {paidCount} payment{paidCount > 1 ? 's' : ''} recorded today
                  {npCount > 0 && ` · ${npCount} N/P`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
