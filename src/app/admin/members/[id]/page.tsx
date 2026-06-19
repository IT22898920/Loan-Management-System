import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MapPin, CheckCircle2, AlertTriangle, CreditCard, Building2, Hash } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from('members')
    .select(`*, center:centers(name, center_number), loans(*, payments(*))`)
    .eq('id', id)
    .single();

  if (!member) notFound();

  let photoUrl: string | null = null;
  if (member.photo_url) {
    const { data } = await supabase.storage.from('member-photos').createSignedUrl(member.photo_url, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  const center = member.center as { name: string; center_number: number } | null;
  const loans = (member.loans ?? []) as Array<{
    id: string; loan_plan: number | null; principal: number | null; interest: number | null;
    original_balance: number | null; cycle_no: number | null;
    loan_balance: number; weekly_payment: number;
    issued_date: string; status: string; is_first_loan: boolean;
    payments: Array<{ id: string; amount_paid: number; is_not_paid: boolean; shortfall: number; payment_date: string; gps_lat: number | null; gps_lng: number | null; gps_address: string | null }>;
  }>;

  const activeLoans = loans.filter(l => l.status === 'active');
  const completedLoans = loans.filter(l => l.status === 'completed');
  // "Member since" = earliest loan issue date from the sheet (member.created_at is just the import date)
  const memberSince = loans.length
    ? loans.map(l => l.issued_date).filter(Boolean).sort()[0]
    : member.created_at;

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <Link href="/admin/members" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Members
        </Link>
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <Image src={photoUrl} alt={member.full_name} width={56} height={56} className="w-14 h-14 rounded-2xl object-cover border-2 border-white/30" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-2xl font-bold">
              {member.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{member.full_name}</h1>
            <div className="flex items-center gap-3 mt-1 text-blue-200 text-sm">
              <span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" />{member.member_number}</span>
              {center && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{center.name}</span>}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-sm sm:max-w-md">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Active Loans</p>
            <p className="text-xl font-bold mt-0.5">{activeLoans.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Completed</p>
            <p className="text-xl font-bold mt-0.5">{completedLoans.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Member Since</p>
            <p className="text-sm font-semibold mt-0.5">{formatDate(memberSince)}</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-4 max-w-4xl">
        {loans.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-muted-foreground">
            <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No loans yet</p>
          </div>
        )}

        {loans.map((loan) => (
          <div key={loan.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Loan header */}
            <div className="px-5 py-4 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${loan.status === 'active' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                  <CreditCard className={`h-5 w-5 ${loan.status === 'active' ? 'text-blue-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">Rs. {(loan.principal ?? loan.original_balance ?? loan.loan_balance).toLocaleString()} Loan</h3>
                    {loan.is_first_loan && (
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-medium">First Loan</span>
                    )}
                    {loan.cycle_no && loan.cycle_no > 1 && (
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-medium">Cycle {loan.cycle_no}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Issued {formatDate(loan.issued_date)}
                    {loan.interest != null && loan.interest > 0 && ` · Interest Rs. ${loan.interest.toLocaleString()}`}
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold ${
                loan.status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
              }`}>
                {loan.status === 'active' ? 'Active' : 'Completed'}
              </span>
            </div>

            {/* Loan stats */}
            <div className="px-5 py-4 grid grid-cols-3 gap-4 border-b border-gray-50">
              <div>
                <p className="text-xs text-muted-foreground">Balance (L/B)</p>
                <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(loan.loan_balance)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Weekly Payment</p>
                <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(loan.weekly_payment)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payments Made</p>
                <p className="font-bold text-gray-900 mt-0.5">{loan.payments?.length ?? 0}</p>
              </div>
            </div>

            {/* Payment history */}
            {loan.payments && loan.payments.length > 0 && (() => {
              // Sort oldest → newest to compute running balance
              const sorted = [...loan.payments].sort(
                (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
              );
              const totalPaid = sorted.reduce((s, p) => s + (p.is_not_paid ? 0 : p.amount_paid), 0);
              let running = loan.loan_balance + totalPaid; // initial balance before any payments
              const withBalance = sorted.map((p) => {
                if (!p.is_not_paid) running -= p.amount_paid;
                return { ...p, balanceAfter: running };
              });
              const display = [...withBalance].reverse(); // newest first

              return (
                <div className="p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Payment History</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {display.map((p) => (
                      <div key={p.id} className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                          <div className="flex items-center gap-2.5">
                            {p.is_not_paid ? (
                              <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                              </div>
                            ) : p.shortfall > 0 ? (
                              <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end pl-8 sm:pl-0">
                            {p.gps_lat && p.gps_lng ? (
                              <a
                                href={`https://www.google.com/maps?q=${p.gps_lat},${p.gps_lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-700 transition-colors"
                                title="Open in Google Maps"
                              >
                                <MapPin className="h-3.5 w-3.5" />
                              </a>
                            ) : p.gps_address ? (
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                            ) : null}
                            {p.is_not_paid ? (
                              <Badge variant="destructive" className="text-xs py-0">N/P</Badge>
                            ) : (
                              <span className={`text-xs font-semibold ${p.shortfall > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                                {formatCurrency(p.amount_paid)}
                                {p.shortfall > 0 && <span className="text-red-500 ml-1">(-{formatCurrency(p.shortfall)})</span>}
                              </span>
                            )}
                            {/* Running balance after this payment */}
                            <span className="text-xs text-muted-foreground sm:border-l sm:border-gray-200 sm:pl-3">
                              L/B: <span className="font-semibold text-gray-700">{formatCurrency(p.balanceAfter)}</span>
                            </span>
                          </div>
                        </div>
                        {p.gps_address && (
                          <p className="text-[10px] text-muted-foreground pl-8 leading-tight">{p.gps_address}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
