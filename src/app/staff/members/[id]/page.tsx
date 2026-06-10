import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft, AlertTriangle, CheckCircle2, MinusCircle, CreditCard, Clock } from 'lucide-react';
import { formatCurrency, formatDate, getTodayString } from '@/lib/utils';

export default async function StaffMemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: member } = await supabase
    .from('members')
    .select(`*, center:centers(name, center_number), loans(id, loan_plan, principal, loan_balance, weekly_payment, status, issued_date)`)
    .eq('id', id)
    .single();

  if (!member) notFound();

  const activeLoans = (member.loans ?? []).filter((l: { status: string }) => l.status === 'active');

  if (activeLoans.length === 0) {
    redirect('/staff/dashboard');
  }

  const loanIds = activeLoans.map((l: { id: string }) => l.id);

  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const fourWeeksAgoString = `${fourWeeksAgo.getFullYear()}-${String(fourWeeksAgo.getMonth() + 1).padStart(2, '0')}-${String(fourWeeksAgo.getDate()).padStart(2, '0')}`;

  const { data: recentPayments } = await supabase
    .from('payments')
    .select('*, loan:loans(principal)')
    .in('loan_id', loanIds)
    .gte('payment_date', fourWeeksAgoString)
    .order('payment_date', { ascending: false })
    .limit(16);

  let photoUrl: string | null = null;
  if (member.photo_url) {
    const { data } = await supabase.storage.from('member-photos').createSignedUrl(member.photo_url, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  const center = member.center as { name: string; center_number: number } | null;
  const today = getTodayString();

  const totalLoanBalance = activeLoans.reduce((s: number, l: { loan_balance: number }) => s + l.loan_balance, 0);
  const completedCount = (member.loans ?? []).filter((l: { status: string }) => l.status === 'completed').length;

  return (
    <div className="pb-24">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white -mx-4 px-4 pt-4 pb-6 mb-5">
        <Link href="/staff/dashboard" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="flex items-center gap-4 mb-4">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={member.full_name}
              width={60}
              height={60}
              className="w-14 h-14 rounded-2xl object-cover border-2 border-white/30 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-2xl font-bold shrink-0">
              {member.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight">{member.full_name}</h1>
            <p className="text-blue-200 text-sm">#{member.member_number}</p>
            {center && <p className="text-blue-200 text-xs">{center.name} · Center #{center.center_number}</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20">
            <p className="text-[10px] text-blue-200">Active Loans</p>
            <p className="font-bold">{activeLoans.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20">
            <p className="text-[10px] text-blue-200">Total L/B</p>
            <p className="font-bold">{formatCurrency(totalLoanBalance)}</p>
          </div>
          {completedCount > 0 && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20">
              <p className="text-[10px] text-blue-200">Completed</p>
              <p className="font-bold">{completedCount}</p>
            </div>
          )}
        </div>
      </div>

      {/* Active Loans */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="font-semibold text-gray-900">Active Loans</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {activeLoans.map((loan: { id: string; loan_plan: number | null; principal: number | null; loan_balance: number; weekly_payment: number; issued_date: string }) => (
            <div key={loan.id} className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                  Rs. {(loan.principal ?? loan.loan_balance).toLocaleString()} Loan
                </span>
                <span className="text-xs text-muted-foreground">Since {formatDate(loan.issued_date)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Loan Balance (L/B)</p>
                  <p className="font-bold text-lg text-gray-900">{formatCurrency(loan.loan_balance)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Weekly Payment</p>
                  <p className="font-bold text-lg text-primary">{formatCurrency(loan.weekly_payment)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
            <Clock className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Recent Payments</h2>
            <p className="text-xs text-muted-foreground">Last 4 weeks</p>
          </div>
        </div>

        {!recentPayments || recentPayments.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-muted-foreground text-sm">No payments in the last 4 weeks.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentPayments.map((p) => {
              const loan = p.loan as { principal: number | null } | null;
              const isToday = p.payment_date === today;
              const planLabel = loan?.principal ? `${Math.round(loan.principal / 1000)}K` : '—';

              return (
                <div key={p.id} className={`px-5 py-4 flex items-center justify-between ${isToday ? 'bg-blue-50/50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      p.is_not_paid ? 'bg-red-100' : p.shortfall > 0 ? 'bg-amber-100' : 'bg-green-100'
                    }`}>
                      {p.is_not_paid ? (
                        <MinusCircle className="h-4 w-4 text-red-600" />
                      ) : p.shortfall > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{formatDate(p.payment_date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {planLabel} plan{isToday ? ' · Today' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    {p.is_not_paid ? (
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">N/P</span>
                    ) : (
                      <>
                        <p className={`font-semibold text-sm ${p.shortfall > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                          {formatCurrency(p.amount_paid)}
                        </p>
                        {p.shortfall > 0 && (
                          <p className="text-xs text-red-500">-{formatCurrency(p.shortfall)}</p>
                        )}
                      </>
                    )}
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
