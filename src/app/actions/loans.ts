'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTodayString } from '@/lib/utils';
import { safeError } from '@/lib/safe-error';
import { TODAY_DAY_OF_WEEK } from '@/types';
import { z } from 'zod';

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

  // cycle_no allocation happens INSIDE the SECURITY DEFINER RPC so it can see
  // all loans (RLS hides completed loans from staff, which previously caused
  // cycle_no to collide on the 2nd loan for a returning member).
  const { data: loanId, error } = await supabase.rpc('record_loan', {
    p_member_id: member.id,
    p_principal: principal,
    p_interest: parsed.data.interest,
    p_weekly_payment: parsed.data.weekly_payment,
    p_issued_date: getTodayString(),
    p_product_type: parsed.data.product_type ?? null,
    p_created_by: user.id,
  });

  if (error) {
    console.error('[loans.createLoanAction] record_loan failed', {
      userId: user.id,
      memberId: member.id,
      message: error.message,
    });
    return { error: safeError(error, 'Could not create loan. Please try again.') };
  }

  revalidatePath('/staff/dashboard');
  revalidatePath('/staff/members/' + member.id);
  revalidatePath('/admin/members');
  revalidatePath('/admin/dashboard');
  return { success: true, loanId };
}
