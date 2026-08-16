'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency, getTodayString } from '@/lib/utils';
import { loanRef } from '@/lib/loan-ref';
import { safeError } from '@/lib/safe-error';
import { TODAY_DAY_OF_WEEK } from '@/types';
import { z } from 'zod';

/** Single source of truth for the one-active-loan rule wording. */
function activeLoanError(memberNumber: string, detail?: { cycle_no: number | null; loan_balance: number }): string {
  const ref = detail ? ` (#${loanRef(memberNumber, detail.cycle_no)}, ඉතුරු ${formatCurrency(detail.loan_balance)})` : '';
  return (
    `${memberNumber} දැනටමත් active ණයක් තියෙනවා${ref}. ` +
    'අලුත් ණයක් දෙන්න කලින් ඒක සම්පූර්ණයෙන් settle කරන්න ඕන.'
  );
}

// Pending credits from a historical balance fix. Hardcoded by member_number
// because there are only two known cases. After both are consumed, delete
// this constant + the credit-application branch in createLoanAction.
const PENDING_CREDITS_LKR: Record<string, number> = {
  'MBR-017': 600, // Soma Wickramasinghe
  'MBR-024': 800, // Sumana Karunarathne
};

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

  // Role check — only staff and admins can issue loans
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
    return { error: 'Unauthorized' };
  }

  // Verify member exists and pull member_number + center for authorization check
  const { data: member, error: mErr } = await supabase
    .from('members')
    .select('id, member_number, center_id')
    .eq('id', parsed.data.member_id)
    .single();

  if (mErr || !member) return { error: 'Member not found.' };

  // Authorization: staff can only issue loans to members of centers assigned
  // to them TODAY. Admins are exempt (RLS still applies but admin role bypasses
  // the center-day check).
  if (profile.role === 'staff') {
    const todayDay = TODAY_DAY_OF_WEEK();
    if (!todayDay) {
      return { error: 'Loans can only be issued on working days (Monday–Thursday).' };
    }
    const { data: assignment } = await supabase
      .from('staff_center_assignments')
      .select('id')
      .eq('staff_id', user.id)
      .eq('center_id', member.center_id)
      .eq('day_of_week', todayDay)
      .maybeSingle();
    if (!assignment) {
      return { error: 'This member\'s center is not assigned to you today.' };
    }
  }

  // Client rule: one active loan per member — a new loan needs the previous
  // one completed first. Friendly pre-check here; record_loan re-checks
  // atomically under a member row lock (raises ACTIVE_LOAN_EXISTS on a race).
  const { data: activeLoan } = await supabase
    .from('loans')
    .select('id, cycle_no, loan_balance')
    .eq('member_id', member.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (activeLoan) {
    return { error: activeLoanError(member.member_number, activeLoan) };
  }

  // Apply pending credits (historical balance fix). Net against principal so
  // the smaller loan reflects the credit owed.
  let principal = parsed.data.principal;
  const credit = PENDING_CREDITS_LKR[member.member_number];
  if (credit) {
    principal = Math.max(0, principal - credit);
    console.log('[loans.createLoanAction] credit applied', {
      memberNumber: member.member_number,
      creditLkr: credit,
      adjustedPrincipal: principal,
    });
  }

  // cycle_no allocation + authorization + the one-active-loan rule all live
  // INSIDE the SECURITY DEFINER RPC (migration 029) so a direct RPC call can't
  // bypass them and the check is atomic under the member row lock.
  const { data: rpcResult, error } = await supabase.rpc('record_loan', {
    p_member_id: member.id,
    p_principal: principal,
    p_interest: parsed.data.interest,
    p_weekly_payment: parsed.data.weekly_payment,
    p_issued_date: getTodayString(),
    p_product_type: parsed.data.product_type ?? null,
    p_created_by: user.id,
  });

  if (error) {
    // Structured SQLSTATEs from migration 029; message text kept as fallback
    // for the window where the old RPC is still deployed.
    if (error.code === 'P0301' || error.message?.includes('ACTIVE_LOAN_EXISTS')) {
      return { error: activeLoanError(member.member_number) };
    }
    if (error.code === 'P0302' || error.message?.includes('UNAUTHORIZED')) {
      return { error: 'Unauthorized' };
    }
    if (error.code === 'P0303' || error.message?.includes('MEMBER_NOT_FOUND')) {
      return { error: 'Member not found.' };
    }
    console.error('[loans.createLoanAction] record_loan failed', {
      userId: user.id,
      memberId: member.id,
      message: error.message,
    });
    return { error: safeError(error, 'Could not create loan. Please try again.') };
  }

  // Migration-029 RPC returns jsonb {loan_id, cycle_no}; the pre-029 one
  // returned a bare uuid. Never guess the letter: if the cycle is unknown,
  // fetch it via the admin client (RLS-independent — the user-scoped client
  // can lose visibility across the Asia/Colombo day boundary).
  let loanId: string;
  let cycleNo: number | null = null;
  if (rpcResult && typeof rpcResult === 'object' && 'loan_id' in (rpcResult as object)) {
    const shaped = rpcResult as { loan_id: string; cycle_no: number };
    loanId = shaped.loan_id;
    cycleNo = shaped.cycle_no;
  } else {
    loanId = rpcResult as string;
    const { createAdminClient } = await import('@/lib/supabase/server');
    const admin = await createAdminClient();
    const { data: createdLoan } = await admin
      .from('loans')
      .select('cycle_no')
      .eq('id', loanId)
      .maybeSingle();
    cycleNo = createdLoan?.cycle_no ?? null;
  }
  const newLoanRef = cycleNo != null ? loanRef(member.member_number, cycleNo) : undefined;

  revalidatePath('/staff/dashboard');
  revalidatePath('/staff/members/' + member.id);
  revalidatePath('/admin/members');
  revalidatePath('/admin/dashboard');
  return { success: true, loanId, loanRef: newLoanRef };
}
