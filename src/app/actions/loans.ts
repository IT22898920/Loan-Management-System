'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTodayString } from '@/lib/utils';
import { z } from 'zod';

// Real DIRIYALANKA loans have arbitrary principal + interest + weekly due.
// member_id (uuid) is used (member_number is no longer globally unique).
const newLoanSchema = z.object({
  member_id: z.string().uuid(),
  principal: z.coerce.number().positive(),
  interest: z.coerce.number().min(0),
  weekly_payment: z.coerce.number().positive(),
  product_type: z.coerce.number().int().optional(),
});

export async function createLoanAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = newLoanSchema.safeParse({
    member_id: formData.get('member_id'),
    principal: formData.get('principal'),
    interest: formData.get('interest'),
    weekly_payment: formData.get('weekly_payment'),
    product_type: formData.get('product_type') || undefined,
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  // Verify member exists
  const { data: member, error: mErr } = await supabase
    .from('members')
    .select('id')
    .eq('id', parsed.data.member_id)
    .single();

  if (mErr || !member) return { error: 'Member not found.' };

  // Cycle number = existing loans for this member + 1
  const { count } = await supabase
    .from('loans')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', member.id);

  const cycleNo = (count ?? 0) + 1;
  const isFirstLoan = cycleNo === 1;
  const balance = parsed.data.principal + parsed.data.interest;

  const { error } = await supabase.from('loans').insert({
    member_id: member.id,
    loan_plan: null,
    principal: parsed.data.principal,
    interest: parsed.data.interest,
    original_balance: balance,
    product_type: parsed.data.product_type ?? null,
    cycle_no: cycleNo,
    source: 'app',
    loan_balance: balance,
    weekly_payment: parsed.data.weekly_payment,
    issued_date: getTodayString(),
    status: 'active',
    is_first_loan: isFirstLoan,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath('/staff/dashboard');
  revalidatePath('/admin/members');
  return { success: true };
}
