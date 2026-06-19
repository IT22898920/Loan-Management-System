'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getTodayString } from '@/lib/utils';
import { safeError } from '@/lib/safe-error';
import { z } from 'zod';

const GPS_ERROR_LAT = 'GPS ස්ථානය අවශ්‍යයි — location services on කරන්න (latitude).';
const GPS_ERROR_LNG = 'GPS ස්ථානය අවශ්‍යයි — location services on කරන්න (longitude).';

const paymentSchema = z.object({
  loan_id: z.string().uuid(),
  member_id: z.string().uuid(),
  amount_paid: z.coerce.number().min(0),
  is_not_paid: z.coerce.boolean(),
  // GPS coordinates ARE required (DB constraint payments_app_requires_gps),
  // but exclude exact (0,0) which is the Gulf-of-Guinea fallback indicating
  // the browser geolocation returned null.
  gps_lat: z.coerce
    .number({ invalid_type_error: GPS_ERROR_LAT })
    .finite(GPS_ERROR_LAT)
    .refine((n) => n !== 0 && Math.abs(n) <= 90, GPS_ERROR_LAT),
  gps_lng: z.coerce
    .number({ invalid_type_error: GPS_ERROR_LNG })
    .finite(GPS_ERROR_LNG)
    .refine((n) => n !== 0 && Math.abs(n) <= 180, GPS_ERROR_LNG),
  // Address comes from Nominatim reverse-geocode which often fails on weak
  // signal. Don't block the save — coords alone are enough for accountability.
  gps_address: z.string().optional().default(''),
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
    gps_lat: formData.get('gps_lat'),
    gps_lng: formData.get('gps_lng'),
    gps_address: formData.get('gps_address') ?? '',
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const paymentDate = getTodayString();

  // Forensic trail: log attempt BEFORE calling RPC so a cash-in-hand failure
  // leaves an admin-reconcilable row. Use admin client because the staff row
  // may not yet exist if the RLS check ordering changes.
  const admin = await createAdminClient();
  const { data: attempt } = await admin
    .from('payment_attempts')
    .insert({
      loan_id: parsed.data.loan_id,
      member_id: parsed.data.member_id,
      staff_id: user.id,
      amount_paid: parsed.data.amount_paid,
      is_not_paid: parsed.data.is_not_paid,
      gps_lat: parsed.data.gps_lat,
      gps_lng: parsed.data.gps_lng,
      gps_address: parsed.data.gps_address || null,
      payment_date: paymentDate,
      status: 'pending',
    })
    .select('id')
    .single();
  const attemptId = attempt?.id as string | undefined;

  // Atomic, row-locked, idempotent insert+decrement (record_payment RPC).
  const { data, error } = await supabase.rpc('record_payment', {
    p_loan_id: parsed.data.loan_id,
    p_amount: parsed.data.amount_paid,
    p_is_not_paid: parsed.data.is_not_paid,
    p_gps_lat: parsed.data.gps_lat,
    p_gps_lng: parsed.data.gps_lng,
    p_gps_address: parsed.data.gps_address || null,
    p_payment_date: paymentDate,
  });

  if (error) {
    console.error('[recordPayment] RPC transport error', {
      attemptId,
      loanId: parsed.data.loan_id,
      userId: user.id,
      message: error.message,
    });
    if (attemptId) {
      await admin
        .from('payment_attempts')
        .update({
          status: 'failed',
          error_message: error.message,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', attemptId);
    }
    return { error: safeError(error, 'ගෙවීම save කිරීමට නොහැක. නැවත උත්සාහ කරන්න.') };
  }

  const result = (data ?? {}) as {
    error?: string;
    duplicate?: boolean;
    is_completed?: boolean;
    payment_id?: string;
  };

  if (result.error) {
    console.error('[recordPayment] RPC business error', {
      attemptId,
      loanId: parsed.data.loan_id,
      userId: user.id,
      message: result.error,
    });
    if (attemptId) {
      await admin
        .from('payment_attempts')
        .update({
          status: 'failed',
          error_message: result.error,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', attemptId);
    }
    return { error: result.error };
  }

  // Success — stamp attempt + revalidate all surfaces that show this data
  if (attemptId) {
    await admin
      .from('payment_attempts')
      .update({
        status: result.duplicate ? 'duplicate' : 'success',
        payment_id: result.payment_id ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', attemptId);
  }

  revalidatePath('/staff/dashboard');
  revalidatePath('/staff/centers', 'layout');
  revalidatePath(`/staff/members/${parsed.data.member_id}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/members');
  revalidatePath('/admin/payments');

  if (result.duplicate) {
    return { success: true, isCompleted: false, duplicate: true };
  }
  return { success: true, isCompleted: !!result.is_completed };
}
