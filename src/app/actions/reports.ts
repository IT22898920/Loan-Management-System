'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getTodayString } from '@/lib/utils';
import { safeError } from '@/lib/safe-error';
import { TODAY_DAY_OF_WEEK } from '@/types';
import { z } from 'zod';

export interface StaffReportCenter {
  center_id: string;
  center_name: string;
  center_number: number;
  expected_collection: number;
  collection_amount: number;
  cleared_amount: number;
  loan_issued: number;
}

export interface StaffReportData {
  staff_name: string;
  centers: StaffReportCenter[];
  existing_cash_issued: number | null;
  existing_loan_issued: number | null;
  existing_cash_issued_locked: boolean;
  admin_set_cash_issued_at: string | null;
}

/**
 * Returns aggregated daily-report data for the calling staff.
 *
 * Why this lives in a server action and not the client component:
 * the RLS SELECT policy on `loans` for `staff` is `status = 'active' AND …`.
 * That means any browser-side query the staff makes against `loans` silently
 * hides loans that were COMPLETED today (final payoffs). Those completed loans
 * still own real payment rows that the staff member physically collected, so
 * leaving them out of the report yields cash totals smaller than what's
 * actually in the staff member's hand. The admin client used here bypasses RLS
 * so the totals match the cash on hand.
 */
export async function getStaffReportDataAction(): Promise<
  { error: string } | { data: StaffReportData }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const todayDay = TODAY_DAY_OF_WEEK();
  const today = getTodayString();

  // Week start (Monday, UTC) — loans issued this week are excluded from expected.
  const [yr, mo, dy] = today.split('-').map(Number);
  const todayDate = new Date(Date.UTC(yr, mo - 1, dy));
  const dow = todayDate.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekStartDate = new Date(todayDate);
  weekStartDate.setUTCDate(todayDate.getUTCDate() - daysFromMonday);
  const weekStartString = `${weekStartDate.getUTCFullYear()}-${String(weekStartDate.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getUTCDate()).padStart(2, '0')}`;

  // We use the admin client for all reads below to bypass the staff-active-only
  // RLS filter on the loans table (see docstring above).
  const admin = await createAdminClient();

  const [{ data: profile }, { data: assignments }, { data: todayLoans }, { data: existingReport }] = await Promise.all([
    admin.from('profiles').select('full_name').eq('id', user.id).single(),
    todayDay
      ? admin
          .from('staff_center_assignments')
          .select('center:centers(id, name, center_number)')
          .eq('staff_id', user.id)
          .eq('day_of_week', todayDay)
      : Promise.resolve({ data: null as null }),
    admin.from('loans').select('principal, member:members!inner(center_id)').eq('created_by', user.id).eq('issued_date', today),
    admin.from('daily_reports').select('cash_issued, loan_issued, cash_issued_at').eq('staff_id', user.id).eq('report_date', today).maybeSingle(),
  ]);

  const staffName = profile?.full_name ?? '';

  const loanIssuedByCenter: Record<string, number> = {};
  for (const l of (todayLoans ?? []) as unknown as { principal: number | null; member: { center_id: string } }[]) {
    const cid = l.member.center_id;
    loanIssuedByCenter[cid] = (loanIssuedByCenter[cid] ?? 0) + (l.principal ?? 0);
  }

  const assignedCenters = (assignments ?? [])
    .map((a: { center: unknown }) => a.center as { id: string; name: string; center_number: number } | null)
    .filter((c): c is { id: string; name: string; center_number: number } => Boolean(c));

  const centerReports: StaffReportCenter[] = [];

  for (const center of assignedCenters) {
    // Admin client → sees ALL loans for this center (active + completed today)
    const { data: loans } = await admin
      .from('loans')
      .select('id, weekly_payment, issued_date, status, members!inner(center_id)')
      .eq('members.center_id', center.id);

    // Expected: only ACTIVE loans issued BEFORE this week count toward weekly due
    const expectedCollection = (loans ?? [])
      .filter((l: { status: string; issued_date: string }) => l.status === 'active' && l.issued_date < weekStartString)
      .reduce((s: number, l: { weekly_payment: number }) => s + l.weekly_payment, 0);

    const loanIds = (loans ?? []).map((l: { id: string }) => l.id);
    const loanStatusById = new Map(
      (loans ?? []).map((l: { id: string; status: string }) => [l.id, l.status])
    );

    let collectionAmount = 0;
    let clearedAmount = 0;
    if (loanIds.length > 0) {
      const { data: payments } = await admin
        .from('payments')
        .select('loan_id, amount_paid, is_not_paid')
        .in('loan_id', loanIds)
        .eq('staff_id', user.id)
        .eq('payment_date', today);

      for (const p of payments ?? []) {
        if (p.is_not_paid) continue;
        collectionAmount += Number(p.amount_paid);
        if (loanStatusById.get(p.loan_id) !== 'active') {
          clearedAmount += Number(p.amount_paid);
        }
      }
    }

    centerReports.push({
      center_id: center.id,
      center_name: center.name,
      center_number: center.center_number,
      expected_collection: expectedCollection,
      collection_amount: collectionAmount,
      cleared_amount: clearedAmount,
      loan_issued: loanIssuedByCenter[center.id] ?? 0,
    });
  }

  return {
    data: {
      staff_name: staffName,
      centers: centerReports,
      existing_cash_issued: existingReport?.cash_issued ?? null,
      existing_loan_issued: existingReport?.loan_issued ?? null,
      // cash_issued is now controlled exclusively by admin via the
      // cash-issuance action; staff can only view it, never edit.
      existing_cash_issued_locked: true,
      admin_set_cash_issued_at:
        (existingReport as { cash_issued_at?: string | null } | null)?.cash_issued_at ?? null,
    },
  };
}

// Staff no longer submits cash_issued — admin sets it via the cash-issuance
// action. Staff only submits loan_issued (auto-calculated from today's loans).
const reportSchema = z.object({
  loan_issued: z.coerce.number().min(0),
});

export async function saveReportAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = reportSchema.safeParse({
    loan_issued: formData.get('loan_issued'),
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const today = getTodayString();

  // ── Validate: all members must have a payment record today ──────────────
  const todayDay = TODAY_DAY_OF_WEEK();
  if (!todayDay) {
    return { error: 'වැඩ කරන දින (සඳුදා–බ්‍රහස්පතින්දා) පමණක් වාර්තා යැවිය හැක.' };
  }
  {
    // Week start (Monday) — parse YYYY-MM-DD as UTC so this stays correct on
    // any deployment timezone (Vercel default is UTC; US-region datacenters
    // would otherwise shift the date).
    const [yr, mo, dy] = today.split('-').map(Number);
    const todayDate = new Date(Date.UTC(yr, mo - 1, dy));
    const dow = todayDate.getUTCDay(); // 0=Sun..6=Sat
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const weekStartDate = new Date(todayDate);
    weekStartDate.setUTCDate(todayDate.getUTCDate() - daysFromMonday);
    const weekStart = `${weekStartDate.getUTCFullYear()}-${String(weekStartDate.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getUTCDate()).padStart(2, '0')}`;

    const { data: assignments } = await supabase
      .from('staff_center_assignments')
      .select('center_id')
      .eq('staff_id', user.id)
      .eq('day_of_week', todayDay);

    const centerIds = (assignments ?? []).map((a: { center_id: string }) => a.center_id);

    if (centerIds.length > 0) {
      // Active loans issued before this week (i.e., payment is due today)
      const { data: dueLoansRaw } = await supabase
        .from('loans')
        .select('id, member:members!inner(full_name, center_id)')
        .eq('status', 'active')
        .in('members.center_id', centerIds)
        .lt('issued_date', weekStart);

      const dueLoans = (dueLoansRaw ?? []) as unknown as { id: string; member: { full_name: string; center_id: string } | null }[];
      const dueLoanIds = dueLoans.map((l) => l.id);

      if (dueLoanIds.length > 0) {
        const { data: todayPayments } = await supabase
          .from('payments')
          .select('loan_id')
          .in('loan_id', dueLoanIds)
          .eq('staff_id', user.id)
          .eq('payment_date', today);

        const recordedLoanIds = new Set((todayPayments ?? []).map((p: { loan_id: string }) => p.loan_id));
        const missing = dueLoans.filter((l) => !recordedLoanIds.has(l.id));

        if (missing.length > 0) {
          const names = missing
            .map((l) => l.member?.full_name ?? 'Unknown')
            .join(', ');
          return { error: `පහත members ගේ payment records නැත — submit කිරීමට පෙර Paid/Shortfall/N/P ලෙස සටහන් කරන්න:\n${names}` };
        }
      }
    }
  }
  // ───────────────────────────────────────────────────────────────────────

  // Check if report already exists for today
  const { data: existing } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('staff_id', user.id)
    .eq('report_date', today)
    .single();

  if (existing) {
    // IMPORTANT: do NOT include cash_issued in the update payload — that field
    // is owned by the admin cash-issuance action, and overwriting it here
    // (even with the same value) would clobber whatever admin set.
    const { data: updated, error: updateError } = await supabase
      .from('daily_reports')
      .update({
        loan_issued: parsed.data.loan_issued,
        submitted_at: new Date().toISOString(),
      })
      .eq('staff_id', user.id)
      .eq('report_date', today)
      .select();

    if (updateError) {
      console.error('[reports.saveReportAction] update failed', {
        userId: user.id,
        message: updateError.message,
      });
      return { error: safeError(updateError, 'වාර්තාව සුරැකීමට නොහැක.') };
    }
    if (!updated || updated.length === 0) {
      // RLS blocked update — delete + re-insert.
      // New row defaults cash_issued to 0; admin must re-enter it. This path
      // is rare (RLS misconfiguration) and the alternative would be silently
      // losing the staff's loan_issued submission.
      await supabase.from('daily_reports').delete().eq('staff_id', user.id).eq('report_date', today);
      const { error: insertError } = await supabase.from('daily_reports').insert({
        staff_id: user.id,
        report_date: today,
        cash_issued: 0,
        loan_issued: parsed.data.loan_issued,
        submitted_at: new Date().toISOString(),
      });
      if (insertError) {
        console.error('[reports.saveReportAction] insert-after-delete failed', {
          userId: user.id,
          message: insertError.message,
        });
        return { error: safeError(insertError, 'වාර්තාව සුරැකීමට නොහැක.') };
      }
    }
  } else {
    // First save of the day — admin has not set cash_issued yet, so default
    // to 0. Admin will fill it in via the cash-issuance action.
    const { error: insertError } = await supabase.from('daily_reports').insert({
      staff_id: user.id,
      report_date: today,
      cash_issued: 0,
      loan_issued: parsed.data.loan_issued,
      submitted_at: new Date().toISOString(),
    });
    if (insertError) {
      console.error('[reports.saveReportAction] insert failed', {
        userId: user.id,
        message: insertError.message,
      });
      return { error: safeError(insertError, 'වාර්තාව සුරැකීමට නොහැක.') };
    }
  }

  revalidatePath('/staff/report');
  revalidatePath('/admin/reports');
  return { success: true };
}
