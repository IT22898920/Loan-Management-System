'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { safeError } from '@/lib/safe-error';
import { z } from 'zod';

export type LoanPlan = {
  id: string;
  principal: number;
  interest: number;
  total_balance: number;
  weekly_payment: number;
  duration_weeks: number;
  member_type: 'new' | 'returning' | 'both';
  category: 'small' | 'medium' | 'large';
  is_active: boolean;
  display_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const planSchema = z.object({
  principal: z.coerce.number().positive(),
  interest: z.coerce.number().min(0),
  total_balance: z.coerce.number().positive(),
  weekly_payment: z.coerce.number().positive(),
  duration_weeks: z.coerce.number().int().positive(),
  member_type: z.enum(['new', 'returning', 'both']),
  category: z.enum(['small', 'medium', 'large']),
  is_active: z.coerce.boolean().optional().default(true),
  display_order: z.coerce.number().int().optional().default(0),
  notes: z.string().optional(),
});

function revalidateLoanPlanPaths() {
  revalidatePath('/admin/loan-plans');
  revalidatePath('/staff/loans/new');
}

export async function getActiveLoanPlansAction(): Promise<
  { success: true; data: LoanPlan[] } | { success: false; error: string }
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('loan_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return { success: false, error: safeError(error, 'Could not load loan plans.') };
  }

  return { success: true, data: (data ?? []) as LoanPlan[] };
}

export async function createLoanPlanAction(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const parsed = planSchema.safeParse({
    principal: formData.get('principal'),
    interest: formData.get('interest'),
    total_balance: formData.get('total_balance'),
    weekly_payment: formData.get('weekly_payment'),
    duration_weeks: formData.get('duration_weeks'),
    member_type: formData.get('member_type'),
    category: formData.get('category'),
    is_active: formData.get('is_active') ?? undefined,
    display_order: formData.get('display_order') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.from('loan_plans').insert(parsed.data);

  if (error) return { error: safeError(error, 'Could not create loan plan.') };

  revalidateLoanPlanPaths();
  return { success: true };
}

export async function updateLoanPlanAction(id: string, formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const parsed = planSchema.safeParse({
    principal: formData.get('principal'),
    interest: formData.get('interest'),
    total_balance: formData.get('total_balance'),
    weekly_payment: formData.get('weekly_payment'),
    duration_weeks: formData.get('duration_weeks'),
    member_type: formData.get('member_type'),
    category: formData.get('category'),
    is_active: formData.get('is_active') ?? undefined,
    display_order: formData.get('display_order') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.from('loan_plans').update(parsed.data).eq('id', id);

  if (error) return { error: safeError(error, 'Could not update loan plan.') };

  revalidateLoanPlanPaths();
  return { success: true };
}

export async function deleteLoanPlanAction(id: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createAdminClient();
  // Soft delete — preserves historical loans that reference this plan.
  const { error } = await supabase
    .from('loan_plans')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return { error: safeError(error, 'Could not delete loan plan.') };

  revalidateLoanPlanPaths();
  return { success: true };
}

export async function toggleLoanPlanActiveAction(id: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createAdminClient();

  const { data: current, error: readErr } = await supabase
    .from('loan_plans')
    .select('is_active')
    .eq('id', id)
    .single();

  if (readErr || !current) {
    return { error: safeError(readErr, 'Loan plan not found.') };
  }

  const { error } = await supabase
    .from('loan_plans')
    .update({ is_active: !current.is_active })
    .eq('id', id);

  if (error) return { error: safeError(error, 'Could not toggle loan plan status.') };

  revalidateLoanPlanPaths();
  return { success: true };
}
