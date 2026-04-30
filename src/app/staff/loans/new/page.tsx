'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Search, PlusCircle, CheckCircle2, CreditCard, Building2, Calendar, BadgeCheck, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { createLoanAction } from '@/app/actions/loans';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LOAN_PLANS } from '@/types';

interface FoundMember {
  id: string;
  full_name: string;
  member_number: string;
  photo_url: string | null;
  created_at: string;
  center: { name: string; center_number: number } | null;
  loans: { id: string; loan_plan: number; loan_balance: number; weekly_payment: number; status: string; issued_date: string }[];
}

const PLAN_COLORS: Record<number, string> = {
  5000:  'from-emerald-500 to-teal-600',
  10000: 'from-blue-500 to-indigo-600',
  20000: 'from-purple-500 to-violet-600',
};

const PLAN_BADGE: Record<number, string> = {
  5000:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  10000: 'bg-blue-100 text-blue-700 border-blue-200',
  20000: 'bg-violet-100 text-violet-700 border-violet-200',
};

export default function NewLoanPage() {
  const router = useRouter();
  const [memberNumber, setMemberNumber] = useState('');
  const [member, setMember] = useState<FoundMember | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [plan, setPlan] = useState('');
  const [saving, setSaving] = useState(false);

  async function searchMember() {
    if (!memberNumber.trim()) return;
    setSearching(true);
    setMember(null);
    setPhotoUrl(null);
    setPlan('');

    const supabase = createClient();
    const { data } = await supabase
      .from('members')
      .select(`id, full_name, member_number, photo_url, created_at, center:centers(name, center_number), loans(id, loan_plan, loan_balance, weekly_payment, status, issued_date)`)
      .eq('member_number', memberNumber.trim())
      .single();

    setSearching(false);

    if (!data) {
      toast.error('Member not found with that number.');
      return;
    }

    setMember(data as unknown as FoundMember);

    // Load signed photo URL
    if (data.photo_url) {
      const { data: signed } = await supabase.storage
        .from('member-photos')
        .createSignedUrl(data.photo_url, 3600);
      if (signed?.signedUrl) setPhotoUrl(signed.signedUrl);
    }
  }

  const selectedPlanConfig = LOAN_PLANS.find((p) => p.plan === parseInt(plan));
  const activeLoans = member?.loans?.filter((l) => l.status === 'active') ?? [];
  const completedLoans = member?.loans?.filter((l) => l.status === 'completed') ?? [];
  const isFirstLoan = (member?.loans?.length ?? 0) === 0;
  const expectedBalance = selectedPlanConfig
    ? isFirstLoan ? selectedPlanConfig.new_member_balance : selectedPlanConfig.returning_balance
    : 0;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!member || !plan) { toast.error('Please select a member and loan plan.'); return; }

    setSaving(true);
    const fd = new FormData();
    fd.append('member_number', member.member_number);
    fd.append('loan_plan', plan);

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
            placeholder="Member number (e.g. MBR-001)"
            value={memberNumber}
            onChange={(e) => setMemberNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchMember()}
            className="rounded-xl"
          />
          <Button onClick={searchMember} disabled={searching} className="rounded-xl px-4 shrink-0">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Found Member Card — detailed */}
      {member && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          {/* Member header */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100 px-5 py-4">
            <div className="flex items-center gap-4">
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={member.full_name}
                  width={56}
                  height={56}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm shrink-0"
                />
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

          {/* Member details grid */}
          <div className="divide-y divide-gray-50">
            <div className="grid grid-cols-2 divide-x divide-gray-50">
              <div className="px-5 py-3.5 flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Center</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {(member.center as { name: string; center_number: number } | null)?.name ?? '—'}
                  </p>
                </div>
              </div>
              <div className="px-5 py-3.5 flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Joined</p>
                  <p className="text-sm font-semibold text-gray-800">{formatDate(member.created_at)}</p>
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

            {/* Active loans list */}
            {activeLoans.length > 0 && (
              <div className="px-5 py-3.5">
                <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">Current Active Loans</p>
                <div className="space-y-2">
                  {activeLoans.map((l) => (
                    <div key={l.id} className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${PLAN_BADGE[l.loan_plan]}`}>
                      <span className="font-bold">
                        {l.loan_plan === 5000 ? '5K Plan' : l.loan_plan === 10000 ? '10K Plan' : '20K Plan'}
                      </span>
                      <span>L/B: <strong>{formatCurrency(l.loan_balance)}</strong></span>
                      <span>Weekly: <strong>{formatCurrency(l.weekly_payment)}</strong></span>
                      <span className="text-gray-400">Since {formatDate(l.issued_date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Loan plan selection */}
      {member && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Select Loan Plan</p>
            <Select onValueChange={setPlan} required>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Choose a plan..." />
              </SelectTrigger>
              <SelectContent>
                {LOAN_PLANS.map((p) => (
                  <SelectItem key={p.plan} value={p.plan.toString()}>
                    Rs. {p.plan.toLocaleString()} — Weekly {formatCurrency(p.weekly_payment)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedPlanConfig && (
              <div className={`mt-4 p-4 rounded-xl bg-gradient-to-br ${PLAN_COLORS[selectedPlanConfig.plan] ?? 'from-gray-500 to-gray-600'} text-white`}>
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="h-5 w-5" />
                  <span className="font-semibold">
                    {selectedPlanConfig.plan === 5000 ? '5K Plan' : selectedPlanConfig.plan === 10000 ? '10K Plan' : '20K Plan'}
                    {isFirstLoan ? ' · First Loan Rate' : ' · Returning Member Rate'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/20 rounded-xl p-3">
                    <p className="text-xs text-white/80 mb-0.5">Starting L/B</p>
                    <p className="font-black text-xl">{formatCurrency(expectedBalance)}</p>
                    <p className="text-[10px] text-white/60 mt-0.5">{isFirstLoan ? 'New member' : 'Returning'}</p>
                  </div>
                  <div className="bg-white/20 rounded-xl p-3">
                    <p className="text-xs text-white/80 mb-0.5">Weekly Payment</p>
                    <p className="font-black text-xl">{formatCurrency(selectedPlanConfig.weekly_payment)}</p>
                    <p className="text-[10px] text-white/60 mt-0.5">Every week</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl h-14 text-base font-semibold"
            size="lg"
            disabled={saving || !plan}
          >
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
