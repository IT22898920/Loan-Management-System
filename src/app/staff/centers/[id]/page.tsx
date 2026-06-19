import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle, CheckCircle2, MinusCircle, ChevronRight, Banknote, Trophy } from 'lucide-react';
import { formatCurrency, getTodayString } from '@/lib/utils';

interface LoanWithMember {
  id: string;
  loan_plan: number | null;
  principal: number | null;
  loan_balance: number;
  weekly_payment: number;
  status: string;
  issued_date: string;
  member: { id: string; full_name: string; member_number: string } | null;
  todayPayment?: { amount_paid: number; is_not_paid: boolean; shortfall: number } | null;
  isNewThisWeek?: boolean;
  completedToday?: boolean;
  prevAlert?: { np: boolean; shortfall: boolean; netOwed: number } | null;
}

const LOAN_SELECT = `id, loan_plan, principal, loan_balance, weekly_payment, status, issued_date, member:members!inner(id, full_name, member_number, center_id)`;

export default async function CenterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = getTodayString();

  // Calculate start of current week (Monday)
  const todayDate = new Date(today);
  const daysFromMonday = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1;
  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() - daysFromMonday);
  const weekStartString = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

  const { data: center } = await supabase
    .from('centers')
    .select('id, name, center_number')
    .eq('id', id)
    .single();

  if (!center) notFound();

  const { data: loans } = await supabase
    .from('loans')
    .select(LOAN_SELECT)
    .eq('status', 'active')
    .eq('members.center_id', id);

  const { data: todayPayments } = await supabase
    .from('payments')
    .select('loan_id, amount_paid, is_not_paid, shortfall')
    .eq('staff_id', user.id)
    .eq('payment_date', today);

  const paymentByLoan = new Map((todayPayments ?? []).map((p) => [p.loan_id, p]));

  // Fetch previous N/P and shortfall alerts (last 4 weeks, before today)
  const fourWeeksAgo = new Date(todayDate);
  fourWeeksAgo.setDate(todayDate.getDate() - 28);
  const fourWeeksAgoString = `${fourWeeksAgo.getFullYear()}-${String(fourWeeksAgo.getMonth() + 1).padStart(2, '0')}-${String(fourWeeksAgo.getDate()).padStart(2, '0')}`;

  const allLoanIds = (loans ?? []).map((l) => l.id);
  const prevAlertByLoan = new Map<string, { np: boolean; shortfall: boolean; netOwed: number }>();
  if (allLoanIds.length > 0) {
    const { data: prevPayments } = await supabase
      .from('payments')
      .select('loan_id, is_not_paid, shortfall, amount_paid')
      .in('loan_id', allLoanIds)
      .lt('payment_date', today)
      .gte('payment_date', fourWeeksAgoString)
      .order('payment_date', { ascending: true });

    const weeklyByLoan = new Map((loans ?? []).map((l) => [l.id, (l as unknown as { weekly_payment: number }).weekly_payment]));

    const prevByLoan = new Map<string, Array<{ is_not_paid: boolean; shortfall: number; amount_paid: number }>>();
    for (const p of prevPayments ?? []) {
      const arr = prevByLoan.get(p.loan_id) ?? [];
      arr.push(p);
      prevByLoan.set(p.loan_id, arr);
    }

    for (const loanId of allLoanIds) {
      const loanPayments = prevByLoan.get(loanId) ?? [];
      const weekly = weeklyByLoan.get(loanId) ?? 0;
      let hasNP = false;
      let hasPartialShort = false;
      let netOwed = 0;

      for (const p of loanPayments) {
        if (p.is_not_paid) {
          hasNP = true;
          netOwed += weekly;
        } else if ((p.shortfall ?? 0) > 0) {
          hasPartialShort = true;
          netOwed += p.shortfall;
        } else if (p.amount_paid > weekly) {
          netOwed = Math.max(0, netOwed - (p.amount_paid - weekly));
        }
      }

      if (netOwed > 0) {
        prevAlertByLoan.set(loanId, { np: hasNP, shortfall: hasPartialShort, netOwed });
      }
    }
  }

  // Fetch completed loans that were paid off today (they disappear from active list)
  const activeLoanIds = new Set((loans ?? []).map((l) => l.id));
  const completedLoanIdsToday = (todayPayments ?? [])
    .map((p) => p.loan_id)
    .filter((lid) => !activeLoanIds.has(lid));

  const { createAdminClient } = await import('@/lib/supabase/server');
  const adminClient = await createAdminClient();

  let completedTodayLoans: unknown[] = [];
  if (completedLoanIdsToday.length > 0) {
    const { data } = await adminClient
      .from('loans')
      .select(LOAN_SELECT)
      .in('id', completedLoanIdsToday)
      .eq('members.center_id', id);
    completedTodayLoans = data ?? [];
  }

  // All-time completed members in this center (no active loans remaining)
  const activeMemberIds = new Set(
    (loans ?? []).map((l) => (l as unknown as { member: { id: string } }).member?.id)
  );
  const { data: allCompletedLoans } = await adminClient
    .from('loans')
    .select(LOAN_SELECT)
    .eq('status', 'completed')
    .eq('members.center_id', id);

  interface CompletedMemberInfo {
    id: string;
    full_name: string;
    member_number: string;
    principals: number[];
  }
  const completedMemberMap = new Map<string, CompletedMemberInfo>();
  for (const l of (allCompletedLoans ?? []) as unknown as LoanWithMember[]) {
    const m = l.member;
    if (!m || activeMemberIds.has(m.id)) continue; // skip if still has active loan
    if (!completedMemberMap.has(m.id)) {
      completedMemberMap.set(m.id, { id: m.id, full_name: m.full_name, member_number: m.member_number, principals: [] });
    }
    completedMemberMap.get(m.id)!.principals.push(l.principal ?? 0);
  }
  const fullyCompletedMembers = [...completedMemberMap.values()];

  // Single ordered list of active loans (+ completed-today), sorted by member number
  const memberLoans: LoanWithMember[] = [];
  for (const loan of (loans ?? []) as unknown as LoanWithMember[]) {
    loan.todayPayment = paymentByLoan.get(loan.id) ?? null;
    loan.isNewThisWeek = loan.issued_date >= weekStartString;
    loan.prevAlert = prevAlertByLoan.get(loan.id) ?? null;
    memberLoans.push(loan);
  }
  for (const loan of completedTodayLoans as unknown as LoanWithMember[]) {
    loan.todayPayment = paymentByLoan.get(loan.id) ?? null;
    loan.completedToday = true;
    memberLoans.push(loan);
  }
  memberLoans.sort((a, b) => (a.member?.member_number ?? '').localeCompare(b.member?.member_number ?? ''));

  // Only count payments for loans belonging to THIS center
  const centerLoanIds = new Set((loans ?? []).map((l) => l.id));
  const centerPayments = (todayPayments ?? []).filter((p) => centerLoanIds.has(p.loan_id));

  const totalMembers = memberLoans.length;
  const collectedCount = centerPayments.filter(p => !p.is_not_paid).length;
  const npCount = centerPayments.filter(p => p.is_not_paid).length;
  const totalCollected = centerPayments.reduce((s, p) => s + (p.is_not_paid ? 0 : p.amount_paid), 0);
  const totalExpected = (loans ?? [])
    .filter((l) => (l as unknown as { issued_date: string }).issued_date < weekStartString)
    .reduce((s, l) => s + (l as unknown as { weekly_payment: number }).weekly_payment, 0);

  return (
    <div className="pb-28">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white -mx-4 px-4 pt-4 pb-8 mb-6">
        <Link href="/staff/dashboard" className="inline-flex items-center gap-1.5 text-blue-200 hover:text-white text-sm mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="text-2xl font-bold">{center.name}</h1>
        <p className="text-blue-300 text-sm mt-0.5">Center #{center.center_number}</p>

        {/* Collection progress */}
        <div className="mt-5 bg-white/10 rounded-2xl p-4 border border-white/20">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wide">Collected</p>
              <p className="font-black text-2xl mt-0.5">{formatCurrency(totalCollected)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wide">Expected</p>
              <p className="font-bold text-lg mt-0.5 text-blue-100">{formatCurrency(totalExpected)}</p>
            </div>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all"
              style={{ width: `${totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0}%` }}
            />
          </div>
          <p className="text-[10px] text-blue-200 mt-1.5">
            {totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0}% collected
          </p>
        </div>

        <div className="flex gap-3 mt-3 flex-wrap">
          <div className="bg-white/15 rounded-xl px-4 py-2.5 border border-white/20 min-w-[80px]">
            <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wide">Members</p>
            <p className="font-bold text-lg mt-0.5">{totalMembers}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-2.5 border border-white/20 min-w-[90px]">
            <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wide">Done / N/P</p>
            <p className="font-bold text-lg mt-0.5">{collectedCount} / {npCount}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-2.5 border border-white/20 min-w-[80px]">
            <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wide">Balance</p>
            <p className="font-bold text-lg mt-0.5">{formatCurrency(totalExpected - totalCollected)}</p>
          </div>
        </div>
      </div>

      {/* Members list */}
      <div className="space-y-4">
        {memberLoans.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                <Banknote className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-blue-700">Active Members</p>
                <p className="text-xs text-gray-500">{memberLoans.length} member{memberLoans.length > 1 ? 's' : ''} to collect</p>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {memberLoans.map((loan) => {
                const member = loan.member;
                const paid = loan.todayPayment;

                return (
                  <div key={loan.id} className={`px-4 py-3.5 ${paid ? 'bg-gray-50/70' : 'bg-white'}`}>
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        paid?.is_not_paid ? 'bg-red-100 text-red-600' :
                        paid ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {member?.full_name?.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            href={`/staff/members/${member?.id}`}
                            className="font-semibold text-gray-900 text-sm hover:text-primary truncate"
                          >
                            {member?.full_name}
                          </Link>
                          <span className="text-xs text-gray-400">#{member?.member_number}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          <span>L/B: <span className="font-semibold text-gray-800">{formatCurrency(loan.loan_balance)}</span></span>
                          <span>Due: <span className="font-semibold text-gray-800">{formatCurrency(loan.weekly_payment)}</span></span>
                        </div>

                        {loan.prevAlert && (loan.prevAlert.np || loan.prevAlert.shortfall) && (
                          <div className="flex items-center gap-1 mt-1">
                            {loan.prevAlert.np && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                                <AlertTriangle className="h-2.5 w-2.5" /> Prev N/P
                              </span>
                            )}
                            {loan.prevAlert.shortfall && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                <AlertTriangle className="h-2.5 w-2.5" /> Prev Short
                              </span>
                            )}
                          </div>
                        )}

                        {paid && (
                          <div className={`flex items-center gap-1 text-xs font-medium mt-1 ${
                            paid.is_not_paid ? 'text-red-500' : paid.shortfall > 0 ? 'text-amber-600' : 'text-green-600'
                          }`}>
                            {paid.is_not_paid ? (
                              <><MinusCircle className="h-3 w-3" /> Not Paid</>
                            ) : paid.shortfall > 0 ? (
                              <><AlertTriangle className="h-3 w-3" /> {formatCurrency(paid.amount_paid)} · shortfall {formatCurrency(paid.shortfall)}</>
                            ) : (
                              <><CheckCircle2 className="h-3 w-3" /> Paid {formatCurrency(paid.amount_paid)}</>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action */}
                      {loan.completedToday ? (
                        <span className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">
                          <Trophy className="h-3 w-3" /> Completed
                        </span>
                      ) : loan.isNewThisWeek ? (
                        <span className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-blue-100 text-blue-600">
                          Next Week
                        </span>
                      ) : !paid ? (
                        <Button size="sm" asChild className="shrink-0 rounded-xl h-11 px-5">
                          <Link href={`/staff/payment/new?loanId=${loan.id}&memberId=${member?.id}&principal=${loan.principal ?? 0}&weekly=${loan.weekly_payment}&balance=${loan.loan_balance}&prevShortfall=${loan.prevAlert?.netOwed ?? 0}`}>
                            Collect
                          </Link>
                        </Button>
                      ) : (
                        <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${
                          paid.is_not_paid ? 'bg-red-100 text-red-600' :
                          paid.shortfall > 0 ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {paid.is_not_paid ? 'N/P' : 'Done'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {memberLoans.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <p className="font-semibold text-gray-600">No active loan members</p>
            <p className="text-xs text-muted-foreground mt-1">This center has no active loans.</p>
          </div>
        )}

        {/* Fully Completed Members */}
        {fullyCompletedMembers.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                <Trophy className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-emerald-700">Completed Members</p>
                <p className="text-xs text-gray-500">Loan fully repaid · {fullyCompletedMembers.length} member{fullyCompletedMembers.length > 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {fullyCompletedMembers.map((m) => (
                <div key={m.id} className="px-4 py-3.5 flex items-center gap-3 bg-gray-50/30">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700 shrink-0">
                    {m.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-700 text-sm">{m.full_name}</p>
                    <p className="text-xs text-gray-400">#{m.member_number} · {m.principals.length} loan{m.principals.length > 1 ? 's' : ''} completed</p>
                  </div>
                  <span className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">
                    <Trophy className="h-3 w-3" /> Done
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Loan */}
        <Link href="/staff/loans/new">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 flex items-center gap-3 hover:shadow-md transition-all">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Banknote className="h-4 w-4 text-primary" />
            </div>
            <span className="font-medium text-gray-700 text-sm flex-1">Issue New Loan</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        </Link>
      </div>
    </div>
  );
}
