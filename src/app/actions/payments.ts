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
  // Full settlement: staff explicitly clears the remaining loan balance. When a
  // weekly payment already exists today, the extra amount is merged into that
  // row (see applySameDaySettlement) instead of being dropped as a duplicate.
  is_settlement: z.coerce.boolean(),
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
    is_settlement: !isNotPaid && formData.get('is_settlement') === 'true',
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
    // Idempotent retry of a loan-completing payment: the first request settled
    // the loan (status -> completed) but its response was lost, so the retry
    // hits the RPC's "already completed" guard. If today's app payment exists,
    // the cash IS recorded — report success instead of a spurious failure.
    if (result.error === 'Loan is already completed.') {
      // Idempotency requires evidence this request's OWN write already landed —
      // matching amount, N/P flag and staff. A same-day row with different
      // values means NEW cash on a completed loan: fall through to the error
      // path so the discrepancy is surfaced, never masked with a success toast.
      // Exact-match first (plain retried payment), then the merged-settlement
      // shape: same staff, same day, row already holding >= the retried amount
      // — a completed loan cannot absorb more cash, so that row IS this
      // request's earlier merge (weekly + settlement combined).
      const { data: todaysPayment } = await admin
        .from('payments')
        .select('id')
        .eq('loan_id', parsed.data.loan_id)
        .eq('payment_date', paymentDate)
        .eq('is_not_paid', parsed.data.is_not_paid)
        .eq('staff_id', user.id)
        .gte('amount_paid', parsed.data.amount_paid)
        .or('source.neq.import,source.is.null')
        .limit(1)
        .maybeSingle();
      if (todaysPayment) {
        if (attemptId) {
          await admin
            .from('payment_attempts')
            .update({
              status: 'duplicate',
              payment_id: todaysPayment.id,
              resolved_at: new Date().toISOString(),
            })
            .eq('id', attemptId);
        }
        revalidatePaymentPaths(parsed.data.member_id);
        return { success: true, isCompleted: true };
      }
    }
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

  // FULL SETTLEMENT after today's payment: uniq_payment_loan_day_app allows at
  // most one app payment per loan per day, so the RPC reports `duplicate` when
  // the weekly payment is already recorded. For an explicit settlement, merge
  // the extra amount into today's row instead of silently dropping it.
  if (result.duplicate && parsed.data.is_settlement && parsed.data.amount_paid > 0) {
    const settlement = await applySameDaySettlement(
      supabase,
      admin,
      parsed.data.loan_id,
      parsed.data.amount_paid,
      paymentDate
    );

    if ('error' in settlement) {
      console.error('[recordPayment] settlement merge error', {
        attemptId,
        loanId: parsed.data.loan_id,
        userId: user.id,
        message: settlement.error,
      });
      if (attemptId) {
        await admin
          .from('payment_attempts')
          .update({
            status: 'failed',
            error_message: settlement.error,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', attemptId);
      }
      // Revalidate even on failure: the rollback-failed path leaves the
      // payments row mutated, and stale caches would hide exactly the state
      // an admin needs to see to reconcile. Harmless when nothing changed.
      revalidatePaymentPaths(parsed.data.member_id);
      return { error: settlement.error };
    }

    if (attemptId) {
      await admin
        .from('payment_attempts')
        .update({
          status: 'success',
          payment_id: settlement.paymentId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', attemptId);
    }

    revalidatePaymentPaths(parsed.data.member_id);
    return { success: true, isCompleted: settlement.isCompleted };
  }

  if (result.duplicate) {
    // A same-day payment already exists and this was NOT a settlement — the
    // RPC dropped the insert (ON CONFLICT DO NOTHING). Never report success
    // for money that was not recorded: tell the staff member explicitly, and
    // stamp the attempt FAILED (not 'duplicate') so unrecorded cash-in-hand
    // stays visible in the admin's pending/failed reconciliation view.
    const duplicateMsg =
      'මේ ණයට අදට ගෙවීමක් දැනටමත් සටහන් වී ඇත — අලුත් ගෙවීමක් record වුණේ නෑ. ' +
      'ඉතුරු මුදලක් එකතු කරන්න නම් "Settle full balance" option එක පාවිච්චි කරන්න.';
    if (attemptId) {
      await admin
        .from('payment_attempts')
        .update({
          status: 'failed',
          error_message: duplicateMsg,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', attemptId);
    }
    revalidatePaymentPaths(parsed.data.member_id);
    return { error: duplicateMsg };
  }

  // Success — stamp attempt + revalidate all surfaces that show this data
  if (attemptId) {
    await admin
      .from('payment_attempts')
      .update({
        status: 'success',
        payment_id: result.payment_id ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', attemptId);
  }

  revalidatePaymentPaths(parsed.data.member_id);
  return { success: true, isCompleted: !!result.is_completed };
}

function revalidatePaymentPaths(memberId: string) {
  revalidatePath('/staff/dashboard');
  revalidatePath('/staff/centers', 'layout');
  revalidatePath(`/staff/members/${memberId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/members');
  revalidatePath('/admin/payments');
}

/**
 * Merge a same-day settlement into today's existing payment row and decrement
 * the loan balance. Runs only when record_payment reported `duplicate` for an
 * explicit settlement request.
 *
 * Authorization: the loan is re-fetched with the USER-scoped client — staff RLS
 * only exposes ACTIVE loans of members in their today-assigned centers, so a
 * returned row proves both assignment and active status (admins see all).
 * Writes use the admin client (loan updates and payment edits are admin-only),
 * with optimistic guards so a concurrent retry cannot double-apply, and a
 * compensating rollback of the payment row if the balance update fails.
 *
 * ACCEPTED RESIDUAL RISK: the merge + balance decrement are two statements,
 * not one transaction. If two settlements for the SAME loan race each other,
 * one may leave the payment row overstated while its loan guard loses — that
 * path returns an explicit "admin ට දන්වන්න" error and a failed
 * payment_attempts row, so it is always surfaced, never silent. Removing the
 * window entirely needs a dedicated RPC doing both updates under one row lock
 * (planned; DB changes are applied separately from app deploys).
 */
async function applySameDaySettlement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  loanId: string,
  amount: number,
  paymentDate: string
): Promise<{ error: string } | { paymentId: string; isCompleted: boolean }> {
  const { data: loan } = await supabase
    .from('loans')
    .select('id, loan_balance, weekly_payment, status')
    .eq('id', loanId)
    .maybeSingle();

  if (!loan || loan.status !== 'active') {
    return { error: 'Loan not found, already completed, or not assigned to you today.' };
  }

  const balance = Number(loan.loan_balance);
  if (amount > balance) {
    return { error: `Payment amount exceeds loan balance (Rs. ${balance}).` };
  }

  // Today's existing app payment — at most one exists (uniq_payment_loan_day_app,
  // which excludes source='import' history).
  const { data: existing } = await admin
    .from('payments')
    .select('id, amount_paid, is_not_paid, shortfall')
    .eq('loan_id', loanId)
    .eq('payment_date', paymentDate)
    .or('source.neq.import,source.is.null')
    .limit(1)
    .maybeSingle();

  if (!existing) {
    return { error: 'ගෙවීම save කිරීමට නොහැක. නැවත උත්සාහ කරන්න.' };
  }

  const newPaid = Number(existing.amount_paid) + amount;
  const newShortfall = Math.max(0, Number(loan.weekly_payment) - newPaid);
  const newBalance = Math.max(0, balance - amount);
  const isCompleted = newBalance <= 0;

  const { data: mergedRows, error: mergeError } = await admin
    .from('payments')
    .update({ amount_paid: newPaid, is_not_paid: false, shortfall: newShortfall })
    .eq('id', existing.id)
    .eq('amount_paid', existing.amount_paid)
    .select('id');

  if (mergeError || !mergedRows?.length) {
    return { error: safeError(mergeError, 'ගෙවීම update කිරීමට නොහැක. නැවත උත්සාහ කරන්න.') };
  }

  const { data: loanRows, error: loanError } = await admin
    .from('loans')
    .update({ loan_balance: newBalance, status: isCompleted ? 'completed' : 'active' })
    .eq('id', loanId)
    .eq('loan_balance', loan.loan_balance)
    .select('id');

  if (loanError || !loanRows?.length) {
    // Roll the payment row back so records and balance stay consistent.
    // Guarded on the value THIS request wrote — a concurrent request that
    // already merged on top must not be clobbered back to our stale snapshot.
    const { data: rolledBack, error: rollbackError } = await admin
      .from('payments')
      .update({
        amount_paid: existing.amount_paid,
        is_not_paid: existing.is_not_paid,
        shortfall: existing.shortfall,
      })
      .eq('id', existing.id)
      .eq('amount_paid', newPaid)
      .select('id');
    if (rollbackError || !rolledBack?.length) {
      // Rollback could not restore our write (concurrent merge or DB error) —
      // surface loudly so the reconciliation trail explains the state.
      console.error('[settlement] rollback failed — manual reconciliation needed', {
        loanId, paymentId: existing.id, attemptedAmount: newPaid, rollbackError,
      });
      return {
        error:
          'ණය ශේෂය update නොවුණා සහ ගෙවීම auto-restore කිරීමටත් නොහැකි විය. ' +
          'Admin ට දන්වන්න — payment attempts log එකේ සටහන් වී ඇත.',
      };
    }
    return { error: safeError(loanError, 'ණය ශේෂය update කිරීමට නොහැක. නැවත උත්සාහ කරන්න.') };
  }

  return { paymentId: existing.id as string, isCompleted };
}
