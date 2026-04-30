'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { calculateShortfall, newLoanBalance } from '@/lib/loan-calculations';
import { getTodayString } from '@/lib/utils';
import { z } from 'zod';

const paymentSchema = z.object({
  loan_id: z.string().uuid(),
  member_id: z.string().uuid(),
  amount_paid: z.coerce.number().min(0),
  is_not_paid: z.coerce.boolean(),
  gps_lat: z.coerce.number().optional(),
  gps_lng: z.coerce.number().optional(),
  gps_address: z.string().optional(),
});

export async function recordPaymentAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const isNotPaid = formData.get('is_not_paid') === 'true';
  const parsed = paymentSchema.safeParse({
    loan_id: formData.get('loan_id'),
    member_id: formData.get('member_id'),
    amount_paid: isNotPaid ? 0 : formData.get('amount_paid'),
    is_not_paid: isNotPaid,
    gps_lat: formData.get('gps_lat') || undefined,
    gps_lng: formData.get('gps_lng') || undefined,
    gps_address: formData.get('gps_address') || undefined,
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  // Fetch loan to get current balance and weekly payment
  const { data: loan, error: loanErr } = await supabase
    .from('loans')
    .select('loan_balance, weekly_payment, status')
    .eq('id', parsed.data.loan_id)
    .single();

  if (loanErr || !loan) return { error: 'Loan not found.' };
  if (loan.status === 'completed') return { error: 'Loan is already completed.' };

  const amountPaid = parsed.data.amount_paid;

  // Server-side: prevent overpayment
  if (!parsed.data.is_not_paid && amountPaid > loan.loan_balance) {
    return { error: `Payment amount exceeds loan balance (Rs. ${loan.loan_balance}).` };
  }
  const shortfall = parsed.data.is_not_paid ? loan.weekly_payment : calculateShortfall(amountPaid, loan.weekly_payment);
  const updatedBalance = parsed.data.is_not_paid ? loan.loan_balance : newLoanBalance(loan.loan_balance, amountPaid);
  const isCompleted = !parsed.data.is_not_paid && updatedBalance <= 0;

  // Insert payment record — select id so we can roll back by ID if needed
  const { data: insertedPayment, error: payErr } = await supabase.from('payments').insert({
    loan_id: parsed.data.loan_id,
    member_id: parsed.data.member_id,
    staff_id: user.id,
    amount_paid: amountPaid,
    is_not_paid: parsed.data.is_not_paid,
    shortfall,
    payment_date: getTodayString(),
    gps_lat: parsed.data.gps_lat ?? null,
    gps_lng: parsed.data.gps_lng ?? null,
    gps_address: parsed.data.gps_address ?? null,
  }).select('id').single();

  if (payErr) return { error: payErr.message };

  // Update loan balance (use admin client to bypass RLS on update)
  const { createAdminClient } = await import('@/lib/supabase/server');
  const adminClient = await createAdminClient();

  const { error: updateErr } = await adminClient.from('loans').update({
    loan_balance: updatedBalance,
    status: isCompleted ? 'completed' : 'active',
  }).eq('id', parsed.data.loan_id);

  // If loan update fails, roll back only the payment we just inserted
  if (updateErr) {
    await supabase.from('payments').delete().eq('id', insertedPayment!.id);
    return { error: 'Failed to update loan balance. Payment was not recorded.' };
  }

  revalidatePath('/staff/dashboard');
  return { success: true, isCompleted };
}
