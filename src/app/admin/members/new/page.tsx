'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Upload, UserPlus, Banknote, CheckCircle2, Info, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { Center } from '@/types';
import { createMemberAction } from '@/app/actions/members';
import { getActiveLoanPlansAction, type LoanPlan } from '@/app/actions/loan-plans';
import { createLoanAction } from '@/app/actions/loans';
import { formatCurrency } from '@/lib/utils';
import Image from 'next/image';

export default function NewMemberPage() {
  const router = useRouter();
  const [centers, setCenters] = useState<Center[]>([]);
  const [saving, setSaving] = useState(false);
  const [centerId, setCenterId] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [plans, setPlans] = useState<LoanPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [issueLoan, setIssueLoan] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('centers').select('*').order('center_number').then(({ data }) => setCenters(data ?? []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPlansLoading(true);
      const result = await getActiveLoanPlansAction();
      if (cancelled) return;
      if (result.success) {
        // New-member-eligible plans only (new or both). Excludes returning-only.
        const eligible = result.data
          .filter((p) => p.member_type === 'new' || p.member_type === 'both')
          .sort((a, b) => a.display_order - b.display_order);
        setPlans(eligible);
      } else {
        toast.error(result.error);
      }
      setPlansLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupedPlans = useMemo(() => {
    const groups: Record<'small' | 'medium' | 'large', LoanPlan[]> = {
      small: [],
      medium: [],
      large: [],
    };
    for (const p of plans) {
      groups[p.category].push(p);
    }
    return groups;
  }, [plans]);

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

  const memberTypeBadge: Record<'new' | 'returning' | 'both', { label: string; className: string }> = {
    new: { label: 'NEW', className: 'bg-green-100 text-green-700 border-green-200' },
    returning: { label: 'RETURNING', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    both: { label: 'NEW + RETURNING', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!centerId) { toast.error('Please select a center.'); return; }
    if (issueLoan && !selectedPlanId) { toast.error('Please select a loan plan or untick "Issue Initial Loan Now".'); return; }
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    fd.set('center_id', centerId);

    const result = await createMemberAction(fd);

    if (result?.error) {
      setSaving(false);
      toast.error(result.error);
      return;
    }

    // Member created — optionally chain the initial loan.
    if (issueLoan && selectedPlanId && result.memberId) {
      const plan = plans.find((p) => p.id === selectedPlanId);
      if (plan) {
        const loanFd = new FormData();
        loanFd.append('member_id', result.memberId);
        loanFd.append('principal', String(plan.principal));
        loanFd.append('interest', String(plan.interest));
        loanFd.append('weekly_payment', String(plan.weekly_payment));

        const loanRes = await createLoanAction(loanFd);
        setSaving(false);

        if (loanRes?.error) {
          toast.warning(`Member created BUT loan failed (${loanRes.error}) — please retry from staff/loans/new`);
        } else {
          toast.success(`Member created + initial loan issued: ${formatCurrency(plan.total_balance)}`);
        }
        router.push('/admin/members');
        return;
      }
    }

    setSaving(false);
    toast.success('Member created');
    router.push('/admin/members');
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  }

  function handlePhotoRemove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <Link href="/admin/members" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Members
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold">Add New Member</h1>
        <p className="text-blue-200 text-sm mt-1">Register a new loan member</p>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Member Details Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-blue-600" />
              </div>
              <h2 className="font-semibold text-gray-900">Member Details</h2>
            </div>

            <div className="space-y-5">
              {/* Photo upload */}
              <div className="flex justify-center">
                <label className="cursor-pointer group relative">
                  <div className="w-28 h-28 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden group-hover:border-primary transition-colors">
                    {preview ? (
                      <Image src={preview} alt="Preview" width={112} height={112} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="h-7 w-7 text-gray-300" />
                        <span className="text-xs text-gray-400">Photo</span>
                      </div>
                    )}
                  </div>
                  {preview && (
                    <button
                      type="button"
                      onClick={handlePhotoRemove}
                      title="Remove photo"
                      aria-label="Remove photo"
                      className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <input ref={photoInputRef} type="file" name="photo" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    {preview ? 'Tap photo to change · X to remove' : 'Upload Photo (optional)'}
                  </p>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="member_number">Member Number *</Label>
                  <Input id="member_number" name="member_number" required placeholder="e.g. 001" className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input id="full_name" name="full_name" required placeholder="Full name" className="rounded-xl" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Center *</Label>
                <Select onValueChange={setCenterId} required>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select a center" />
                  </SelectTrigger>
                  <SelectContent>
                    {centers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        #{c.center_number} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Initial Loan Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={issueLoan}
                onChange={(e) => {
                  setIssueLoan(e.target.checked);
                  if (!e.target.checked) setSelectedPlanId(null);
                }}
                className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Banknote className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">Issue Initial Loan Now</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Optional — admin can issue the first loan in the same step</p>
                  </div>
                </div>
              </div>
            </label>

            {issueLoan && (
              <div className="mt-5">
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 mb-4 flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Pick a plan to issue together with the member. Only plans available to new members are shown.
                  </p>
                </div>

                {plansLoading ? (
                  <div className="flex items-center justify-center py-6 text-gray-400 text-sm gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading plans...
                  </div>
                ) : plans.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    No active plans available for new members.
                  </div>
                ) : (
                  <div className="space-y-3">
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
                              const badge = memberTypeBadge[row.member_type];
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  onClick={() => setSelectedPlanId(row.id)}
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
                                  <div className="flex items-center justify-between gap-2 mt-1">
                                    <span className="text-[11px] text-gray-500">
                                      {formatCurrency(row.weekly_payment)}/wk · {row.duration_weeks}w
                                    </span>
                                    <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${badge.className}`}>
                                      {badge.label}
                                    </span>
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
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={saving} className="rounded-xl">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Create Member'}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" asChild>
              <Link href="/admin/members">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
