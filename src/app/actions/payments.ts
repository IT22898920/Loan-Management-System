'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
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

  // Atomic, row-locked, idempotent insert+decrement in a single transaction
  // (server-side overpayment/completion logic lives in the RPC). The RPC uses
  // auth.uid() for staff_id and derives member_id from the loan, so neither can
  // be spoofed; a retried/double submit for the same loan+day is a no-op.
  const { data, error } = await supabase.rpc('record_payment', {
    p_loan_id: parsed.data.loan_id,
    p_amount: parsed.data.amount_paid,
    p_is_not_paid: parsed.data.is_not_paid,
    p_gps_lat: parsed.data.gps_lat ?? null,
    p_gps_lng: parsed.data.gps_lng ?? null,
    p_gps_address: parsed.data.gps_address ?? null,
    p_payment_date: getTodayString(),
  });

  if (error) return { error: error.message };
  const result = (data ?? {}) as { error?: string; duplicate?: boolean; is_completed?: boolean };
  if (result.error) return { error: result.error };

  revalidatePath('/staff/dashboard');
  if (result.duplicate) {
    return { success: true, isCompleted: false, duplicate: true };
  }
  return { success: true, isCompleted: !!result.is_completed };
}
