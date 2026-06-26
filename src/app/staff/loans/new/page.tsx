'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Search, PlusCircle, CheckCircle2, CreditCard, Building2, Calendar, BadgeCheck, History, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { createLoanAction } from '@/app/actions/loans';
import { getActiveLoanPlansAction, type LoanPlan as LoanPlanRow } from '@/app/actions/loan-plans';
import { formatCurrency, formatDate } from '@/lib/utils';

interface FoundMember {
  id: string;
  full_name: string;
  member_number: string;
  photo_url: string | null;
  created_at: string;
  center: { name: string; center_number: number } | null;
  loans: { id: string; loan_plan: number | null; principal: number | null; loan_balance: number; weekly_payment: number; status: string; issued_date: string }[];
}

export default function NewLoanPage() {
  const router = useRouter();
  const [memberNumber, setMemberNumber] = useState('');
  const [member, setMember] = useState<FoundMember | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [weekly, setWeekly] = useState('');
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<LoanPlanRow[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPlansLoading(true);
      const result = await getActiveLoanPlansAction();
      if (cancelled) return;
      if (result.success) {
        setPlans(result.data);
      } else {
        toast.error(result.error);
      }
      setPlansLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function searchMember() {
    if (!memberNumber.trim()) return;
    setSearching(true);
    setMember(null);
    setPhotoUrl(null);
    setPrincipal(''); setInterest(''); setWeekly('');
    setSelectedPlanId(null);

    const supabase = createClient();
    const { data } = await supabase
      .from('members')
      .select(`id, full_name, member_number, photo_url, created_at, center:centers(name, center_number), loans(id, loan_plan, principal, loan_balance, weekly_payment, status, issued_date)`)
      .eq('member_number', memberNumber.trim())
      .limit(1)
      .maybeSingle();

    setSearching(false);

    if (!data) {
      toast.error('Member not found with that number.');
      return;
    }

    setMember(data as unknown as FoundMember);

    if (data.photo_url) {
      const { data: signed } = await supabase.storage
        .from('member-photos')
        .createSignedUrl(data.photo_url, 3600);
      if (signed?.signedUrl) setPhotoUrl(signed.signedUrl);
    }
  }

  const activeLoans = member?.loans?.filter((l) => l.status === 'active') ?? [];
  const completedLoans = member?.loans?.filter((l) => l.status === 'completed') ?? [];
  const isFirstLoan = (member?.loans?.length ?? 0) === 0;

  const principalNum = parseFloat(principal) || 0;
  const interestNum = parseFloat(interest) || 0;
  const weeklyNum = parseFloat(weekly) || 0;
  const totalBalance = principalNum + interestNum;

  // Quick-fill from a DB-driven loan plan row
  function applyPlan(row: LoanPlanRow) {
    setPrincipal(String(row.principal));
    setInterest(String(row.interest));
    setWeekly(String(row.weekly_payment));
    setSelectedPlanId(row.id);
  }

  // Filter plans by member type (new vs returning) — 'both' always shows.
  const visiblePlans = useMemo(() => {
    if (!member) return [] as LoanPlanRow[];
    return plans.filter((p) => {
      if (p.member_type === 'both') return true;
      if (p.member_type === 'new') return isFirstLoan;
      if (p.member_type === 'returning') return !isFirstLoan;
      return false;
    });
  }, [plans, member, isFirstLoan]);

  const groupedPlans = useMemo(() => {
    const groups: Record<'small' | 'medium' | 'large', LoanPlanRow[]> = {
      small: [],
      medium: [],
      large: [],
    };
    for (const p of visiblePlans) {
      groups[p.category].push(p);
    }
    return groups;
  }, [visiblePlans]);

  const categoryLabels: Record<'small' | 'medium' | 'large', string> = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
  };

  const categoryStyles: Record<'small' | 'medium' | 'large', string> = {
    small: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-blue-50 text-blue-700 border-blue-200',
    large: 'bg-violet-50 text-violet-700 border-violet-200',
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!member) { toast.error('Please select a member.'); return; }
    if (principalNum <= 0 || weeklyNum <= 0) { toast.error('Enter a valid principal and weekly payment.'); return; }

    setSaving(true);
    const fd = new FormData();
    fd.append('member_id', member.id);
    fd.append('principal', String(principalNum));
    fd.append('interest', String(interestNum));
    fd.append('weekly_payment', String(weeklyNum));

    const result = await createLoanAction(fd);
    setSaving(false);

    if (result?.error) { toast.error(result.error); return; }
    toast.success('New loan created successfully!');
    router.push('/staff/dashboard');
  }

  return (
    <div className="pb-24">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white -mx-4 px-4 pt-4 pb-6 mb-5">
        <Link href="/staff/dashboard" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <PlusCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Create New Loan</h1>
            <p className="text-blue-200 text-sm">Search member by number</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Find Member</p>
        <div className="flex gap-2">
          <Input
            placeholder="Member number (e.g. DLK0096)"
            value={memberNumber}
            onChange={(e) => setMemberNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchMember()}
            className="rounded-xl h-11"
          />
          <Button onClick={searchMember} disabled={searching} className="rounded-xl h-11 px-4 shrink-0" aria-label="Search member">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Found Member Card */}
      {member && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100 px-5 py-4">
            <div className="flex items-center gap-4">
              {photoUrl ? (
                <Image src={photoUrl} alt={member.full_name} width={56} height={56}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-emerald-200 flex items-center justify-center text-2xl font-bold text-emerald-800 shrink-0">
                  {member.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight">{member.full_name}</h3>
                  {isFirstLoan ? (
                    <span className="text-[10px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full">FIRST LOAN</span>
                  ) : (
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">RETURNING</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">#{member.member_number}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            <div className="grid grid-cols-2 divide-x divide-gray-50">
              <div className="px-5 py-3.5 flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Center</p>
                  <p className="text-sm font-semibold text-gray-800">{member.center?.name ?? '—'}</p>
                </div>
              </div>
              <div className="px-5 py-3.5 flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Joined</p>
                  <p className="text-sm font-semibold text-gray-800">{formatDate(member.loans?.map(l => l.issued_date).filter(Boolean).sort()[0] ?? member.created_at)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-gray-50">
              <div className="px-5 py-3.5 flex items-center gap-2.5">
                <BadgeCheck className="h-4 w-4 text-blue-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Active Loans</p>
                  <p className="text-sm font-semibold text-gray-800">{activeLoans.length}</p>
                </div>
              </div>
              <div className="px-5 py-3.5 flex items-center gap-2.5">
                <History className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Completed</p>
                  <p className="text-sm font-semibold text-gray-800">{completedLoans.length}</p>
                </div>
              </div>
            </div>

            {activeLoans.length > 0 && (
              <div className="px-5 py-3.5">
                <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">Current Active Loans</p>
                <div className="space-y-2">
                  {activeLoans.map((l) => (
                    <div key={l.id} className="rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs px-3 py-2.5">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <div className="whitespace-nowrap">
                          <span className="text-blue-500">Principal:</span> <strong>{formatCurrency(l.principal ?? 0)}</strong>
                        </div>
                        <div className="whitespace-nowrap">
                          <span className="text-blue-500">L/B:</span> <strong>{formatCurrency(l.loan_balance)}</strong>
                        </div>
                        <div className="whitespace-nowrap">
                          <span className="text-blue-500">Weekly:</span> <strong>{formatCurrency(l.weekly_payment)}</strong>
                        </div>
                        <div className="whitespace-nowrap text-gray-500">Since {formatDate(l.issued_date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loan entry — custom amounts with quick presets */}
      {member && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Loan Details</p>

            {/* Plan quick-fill from DB */}
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 mb-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-800 leading-relaxed">
                Quick-fill from common plans. You can also enter custom amounts below.
              </p>
            </div>

            {plansLoading ? (
              <div className="flex items-center justify-center py-6 text-gray-400 text-sm gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading plans...
              </div>
            ) : visiblePlans.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                No active plans available for this member.
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {(['small', 'medium', 'large'] as const).map((cat) =>
                  groupedPlans[cat].length === 0 ? null : (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${categoryStyles[cat]}`}>
                          {categoryLabels[cat]}
                        </span>
                        <span className="text-[10px] text-gray-400">{groupedPlans[cat].length} plan{groupedPlans[cat].length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {groupedPlans[cat].map((row) => {
                          const isSelected = selectedPlanId === row.id;
                          return (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => applyPlan(row)}
                              className={`text-left min-h-[44px] rounded-xl border px-3 py-2.5 transition-colors ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                  : 'border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-gray-900">
                                  LKR {Math.round(row.principal / 1000)}K
                                  <span className="text-gray-400 mx-1">→</span>
                                  LKR {Math.round(row.total_balance / 1000)}K
                                </span>
                                {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />}
                              </div>
                              <div className="text-[11px] text-gray-500 mt-1">
                                {formatCurrency(row.weekly_payment)}/wk · {row.duration_weeks}w
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Principal (amount given) Rs.</label>
                <Input type="number" inputMode="numeric" value={principal} onChange={(e) => setPrincipal(e.target.value)}
                  placeholder="e.g. 10000" className="rounded-xl mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Interest Rs.</label>
                <Input type="number" inputMode="numeric" value={interest} onChange={(e) => setInterest(e.target.value)}
                  placeholder="e.g. 2500" className="rounded-xl mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Weekly payment Rs.</label>
                <Input type="number" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value)}
                  placeholder="e.g. 1000" className="rounded-xl mt-1" />
              </div>
            </div>

            {principalNum > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="h-5 w-5" />
                  <span className="font-semibold">{isFirstLoan ? 'First Loan' : 'Returning Member'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/20 rounded-xl p-3">
                    <p className="text-xs text-white/80 mb-0.5">Starting L/B</p>
                    <p className="font-black text-xl">{formatCurrency(totalBalance)}</p>
                    <p className="text-[10px] text-white/60 mt-0.5">Principal + interest</p>
                  </div>
                  <div className="bg-white/20 rounded-xl p-3">
                    <p className="text-xs text-white/80 mb-0.5">Weekly Payment</p>
                    <p className="font-black text-xl">{formatCurrency(weeklyNum)}</p>
                    <p className="text-[10px] text-white/60 mt-0.5">Every week</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full rounded-2xl h-14 text-base font-semibold" size="lg"
            disabled={saving || principalNum <= 0 || weeklyNum <= 0}>
            {saving ? (
              <><Loader2 className="h-5 w-5 animate-spin mr-2" />Creating Loan...</>
            ) : (
              <><PlusCircle className="h-5 w-5 mr-2" />Create Loan</>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
