'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Banknote, Plus, Edit, Trash2, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getActiveLoanPlansAction,
  createLoanPlanAction,
  updateLoanPlanAction,
  deleteLoanPlanAction,
  toggleLoanPlanActiveAction,
} from '@/app/actions/loan-plans';
import type { LoanPlanRow } from '@/types';
import { formatCurrency } from '@/lib/utils';

type Category = 'small' | 'medium' | 'large';
type MemberType = 'new' | 'returning' | 'both';

interface PlanForm {
  principal: string;
  interest: string;
  total_balance: string;
  weekly_payment: string;
  duration_weeks: string;
  member_type: MemberType;
  category: Category;
  display_order: string;
  notes: string;
  is_active: boolean;
}

const EMPTY_FORM: PlanForm = {
  principal: '',
  interest: '',
  total_balance: '',
  weekly_payment: '',
  duration_weeks: '',
  member_type: 'both',
  category: 'small',
  display_order: '0',
  notes: '',
  is_active: true,
};

const CATEGORY_META: Record<
  Category,
  { label: string; gradient: string; chip: string; ring: string }
> = {
  small: {
    label: 'Small',
    gradient: 'from-emerald-500 to-teal-600',
    chip: 'bg-emerald-100 text-emerald-700',
    ring: 'ring-emerald-200',
  },
  medium: {
    label: 'Medium',
    gradient: 'from-blue-500 to-indigo-600',
    chip: 'bg-blue-100 text-blue-700',
    ring: 'ring-blue-200',
  },
  large: {
    label: 'Large',
    gradient: 'from-purple-500 to-fuchsia-600',
    chip: 'bg-purple-100 text-purple-700',
    ring: 'ring-purple-200',
  },
};

const MEMBER_TYPE_LABEL: Record<MemberType, string> = {
  new: 'New members',
  returning: 'Returning',
  both: 'Both',
};

export default function LoanPlansPage() {
  const [plans, setPlans] = useState<LoanPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------
  async function loadPlans() {
    setLoading(true);
    const res = await getActiveLoanPlansAction();
    if (res.success) {
      const sorted = [...res.data].sort((a, b) => a.display_order - b.display_order);
      setPlans(sorted as unknown as LoanPlanRow[]);
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPlans();
  }, []);

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(plan: LoanPlanRow) {
    setEditingId(plan.id);
    setForm({
      principal: String(plan.principal),
      interest: String(plan.interest),
      total_balance: String(plan.total_balance),
      weekly_payment: String(plan.weekly_payment),
      duration_weeks: String(plan.duration_weeks),
      member_type: plan.member_type,
      category: plan.category,
      display_order: String(plan.display_order),
      notes: plan.notes ?? '',
      is_active: plan.is_active,
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  // Auto-calculate total_balance whenever principal or interest changes —
  // keeps the form internally consistent without forcing the admin to do math.
  function updateFormField<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'principal' || key === 'interest') {
        const p = parseFloat(key === 'principal' ? (value as string) : next.principal) || 0;
        const i = parseFloat(key === 'interest' ? (value as string) : next.interest) || 0;
        if (p > 0) next.total_balance = String(p + i);
      }
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Submit (create + edit share this handler)
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const fd = new FormData();
    fd.append('principal', form.principal);
    fd.append('interest', form.interest);
    fd.append('total_balance', form.total_balance);
    fd.append('weekly_payment', form.weekly_payment);
    fd.append('duration_weeks', form.duration_weeks);
    fd.append('member_type', form.member_type);
    fd.append('category', form.category);
    fd.append('display_order', form.display_order || '0');
    fd.append('is_active', form.is_active ? 'true' : 'false');
    if (form.notes.trim()) fd.append('notes', form.notes.trim());

    const res = editingId
      ? await updateLoanPlanAction(editingId, fd)
      : await createLoanPlanAction(fd);

    setSubmitting(false);

    if ('error' in res && res.error) {
      toast.error(res.error);
      return;
    }

    toast.success(editingId ? 'Loan plan updated.' : 'Loan plan created.');
    closeModal();
    void loadPlans();
  }

  // ---------------------------------------------------------------------------
  // Toggle active (optimistic)
  // ---------------------------------------------------------------------------
  async function handleToggle(plan: LoanPlanRow) {
    setTogglingId(plan.id);
    const prev = plans;
    setPlans((p) => p.map((x) => (x.id === plan.id ? { ...x, is_active: !x.is_active } : x)));

    const res = await toggleLoanPlanActiveAction(plan.id);
    setTogglingId(null);

    if ('error' in res && res.error) {
      setPlans(prev); // rollback
      toast.error(res.error);
      return;
    }
    toast.success(plan.is_active ? 'Plan deactivated.' : 'Plan activated.');
  }

  // ---------------------------------------------------------------------------
  // Delete (with confirmation; soft-delete on server side)
  // ---------------------------------------------------------------------------
  async function handleDelete(plan: LoanPlanRow) {
    const ok = window.confirm(
      `Delete the ${formatCurrency(plan.principal)} plan? Existing loans referencing it will be preserved.`,
    );
    if (!ok) return;

    setDeletingId(plan.id);
    const prev = plans;
    setPlans((p) => p.filter((x) => x.id !== plan.id)); // optimistic remove

    const res = await deleteLoanPlanAction(plan.id);
    setDeletingId(null);

    if ('error' in res && res.error) {
      setPlans(prev);
      toast.error(res.error);
      return;
    }
    toast.success('Loan plan deleted.');
  }

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------
  const activePlans = plans.filter((p) => p.is_active);
  const countByCategory: Record<Category, number> = {
    small: activePlans.filter((p) => p.category === 'small').length,
    medium: activePlans.filter((p) => p.category === 'medium').length,
    large: activePlans.filter((p) => p.category === 'large').length,
  };

  // Group by category for grid rendering — already sorted by display_order from loadPlans()
  const grouped: Record<Category, LoanPlanRow[]> = {
    small: plans.filter((p) => p.category === 'small'),
    medium: plans.filter((p) => p.category === 'medium'),
    large: plans.filter((p) => p.category === 'large'),
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Gradient header — matches /admin/staff and /admin/members */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <p className="text-blue-200 text-sm font-medium mb-1">Configuration</p>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Banknote className="h-7 w-7" /> Loan Plans
            </h1>
            <p className="text-blue-200 text-sm mt-1 max-w-xl">
              Configure interest rates and weekly payments for each loan tier.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-blue-700 text-sm font-semibold shadow-sm hover:bg-blue-50 transition-all"
          >
            <Plus className="h-4 w-4" /> Add New Plan
          </button>
        </div>

        {/* Stats cards */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Active Plans</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : activePlans.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Small</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : countByCategory.small}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Medium</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : countByCategory.medium}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Large</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : countByCategory.large}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 md:px-8 py-6 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading loan plans…
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20">
            <Banknote className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-4">No loan plans configured yet.</p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Create your first plan
            </Button>
          </div>
        ) : (
          (['small', 'medium', 'large'] as Category[]).map((cat) => {
            const list = grouped[cat];
            if (list.length === 0) return null;
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${meta.chip}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {list.length} plan{list.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onEdit={() => openEdit(plan)}
                      onToggle={() => handleToggle(plan)}
                      onDelete={() => handleDelete(plan)}
                      toggling={togglingId === plan.id}
                      deleting={deletingId === plan.id}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* Create / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold">
                  {editingId ? 'Edit Loan Plan' : 'New Loan Plan'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Total balance auto-fills from principal + interest.
                </p>
              </div>
              <button
                onClick={closeModal}
                disabled={submitting}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              {/* Money fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="principal">Principal (LKR)</Label>
                  <Input
                    id="principal"
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={form.principal}
                    onChange={(e) => updateFormField('principal', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="interest">Interest (LKR)</Label>
                  <Input
                    id="interest"
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={form.interest}
                    onChange={(e) => updateFormField('interest', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="total_balance">Total Balance (LKR)</Label>
                  <Input
                    id="total_balance"
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={form.total_balance}
                    onChange={(e) => updateFormField('total_balance', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="weekly_payment">Weekly Payment (LKR)</Label>
                  <Input
                    id="weekly_payment"
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={form.weekly_payment}
                    onChange={(e) => updateFormField('weekly_payment', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="duration_weeks">Duration (weeks)</Label>
                  <Input
                    id="duration_weeks"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={form.duration_weeks}
                    onChange={(e) => updateFormField('duration_weeks', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="display_order">Display Order</Label>
                  <Input
                    id="display_order"
                    type="number"
                    step="1"
                    value={form.display_order}
                    onChange={(e) => updateFormField('display_order', e.target.value)}
                  />
                </div>
              </div>

              {/* Selects */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    value={form.category}
                    onChange={(e) => updateFormField('category', e.target.value as Category)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="member_type">Eligible Member Type</Label>
                  <select
                    id="member_type"
                    value={form.member_type}
                    onChange={(e) => updateFormField('member_type', e.target.value as MemberType)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="both">Both</option>
                    <option value="new">New members</option>
                    <option value="returning">Returning members</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <textarea
                  id="notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => updateFormField('notes', e.target.value)}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                />
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-2 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => updateFormField('is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm">Plan is active (visible to staff when issuing loans)</span>
              </label>

              {/* Footer */}
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : editingId ? (
                    'Save changes'
                  ) : (
                    'Create plan'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Plan card — extracted for clarity (heavy presentational block)
// ============================================================================
function PlanCard({
  plan,
  onEdit,
  onToggle,
  onDelete,
  toggling,
  deleting,
}: {
  plan: LoanPlanRow;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
  deleting: boolean;
}) {
  const meta = CATEGORY_META[plan.category];
  const interestPct = plan.principal > 0 ? (plan.interest / plan.principal) * 100 : 0;

  return (
    <div
      className={`relative rounded-2xl border bg-white shadow-sm overflow-hidden transition-all hover:shadow-md ${
        plan.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'
      }`}
    >
      {/* Gradient strip */}
      <div className={`h-1.5 bg-gradient-to-r ${meta.gradient}`} />

      <div className="p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Principal
            </p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(plan.principal)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.chip}`}>
              {meta.label}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
              {MEMBER_TYPE_LABEL[plan.member_type]}
            </span>
            {!plan.is_active && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                Inactive
              </span>
            )}
          </div>
        </div>

        {/* Numbers grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Interest</p>
            <p className="font-semibold tabular-nums">
              {formatCurrency(plan.interest)}
              {interestPct > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                  ({interestPct.toFixed(0)}%)
                </span>
              )}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Total Balance</p>
            <p className="font-semibold tabular-nums">{formatCurrency(plan.total_balance)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Weekly</p>
            <p className="font-semibold tabular-nums">{formatCurrency(plan.weekly_payment)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Duration</p>
            <p className="font-semibold tabular-nums">{plan.duration_weeks} wks</p>
          </div>
        </div>

        {plan.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{plan.notes}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <button
            onClick={onToggle}
            disabled={toggling}
            title={plan.is_active ? 'Deactivate' : 'Activate'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
              plan.is_active
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : plan.is_active ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            {plan.is_active ? 'Active' : 'Hidden'}
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="Delete"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
