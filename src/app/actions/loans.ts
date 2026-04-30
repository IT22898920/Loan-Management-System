'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getLoanBalance, getWeeklyPayment } from '@/lib/loan-calculations';
import { LoanPlan } from '@/types';
import { getTodayString } from '@/lib/utils';
import { z } from 'zod';

const newLoanSchema = z.object({
  member_number: z.string().min(1),
  loan_plan: z.coerce.number().refine((v) => [5000, 10000, 20000].includes(v)) as z.ZodType<LoanPlan>,
});

export async function createLoanAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = newLoanSchema.safeParse({
    member_number: formData.get('member_number'),
    loan_plan: formData.get('loan_plan'),
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  // Find member
  const { data: member, error: mErr } = await supabase
    .from('members')
    .select('id')
    .eq('member_number', parsed.data.member_number)
    .single();

  if (mErr || !member) return { error: 'Member not found with that member number.' };

  // Check if this is the first loan ever
  const { count } = await supabase
    .from('loans')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', member.id);

  const isFirstLoan = (count ?? 0) === 0;
  const loanBalance = getLoanBalance(parsed.data.loan_plan, isFirstLoan);
  const weeklyPayment = getWeeklyPayment(parsed.data.loan_plan);

  const { error } = await supabase.from('loans').insert({
    member_id: member.id,
    loan_plan: parsed.data.loan_plan,
    loan_balance: loanBalance,
    weekly_payment: weeklyPayment,
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
