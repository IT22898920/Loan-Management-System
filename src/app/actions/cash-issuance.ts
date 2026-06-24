'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { safeError } from '@/lib/safe-error';
import { z } from 'zod';

/**
 * Admin-only cash issuance management.
 *
 * Background: `daily_reports.cash_issued` records how much cash the office
 * handed to a staff member at the start of the day for collections + loan
 * disbursement. Historically that value was entered by staff inside their
 * own end-of-day report — which is the wrong place: it's an INPUT to the
 * day, not an output, and tying it to the staff's own submission means the
 * office has no record of issuance until after-hours.
 *
 * This action lets admins record `cash_issued` directly, BEFORE staff submit
 * the daily report. When staff later submit, `saveReportAction` only touches
 * cash_issued/loan_issued/submitted_at on the existing row — the admin's
 * cash_issued value is preserved as long as the staff submit form is
 * pre-filled from it (see /staff/report page).
 *
 * Why createAdminClient? `daily_reports` RLS only lets staff INSERT/UPDATE
 * rows where `staff_id = auth.uid()` — an admin acting on someone else's
 * row would be silently blocked. requireAdmin() is the gate that justifies
 * bypassing RLS here.
 */

const schema = z.object({
  staffId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().min(0).max(10_000_000),
  notes: z.string().optional(),
});

export async function setStaffCashIssuedAction(
  staffId: string,
  date: string,
  amount: number,
  notes?: string
) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const parsed = schema.safeParse({ staffId, date, amount, notes });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createAdminClient();

  // Defence-in-depth: never let an admin attach cash_issued to a non-staff
  // profile (e.g., another admin), which would corrupt the reports view.
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', parsed.data.staffId)
    .single();
  if (!target) return { error: 'Staff member not found.' };
  if (target.role !== 'staff') return { error: 'Cannot set cash issued for non-staff account.' };

  const nowIso = new Date().toISOString();

  // Look up existing daily_reports row by (staff_id, report_date).
  // We can't use a single UPSERT here because the INSERT path must NOT touch
  // `submitted_at` (so the staff's later submission flips it from null → ts),
  // while the UPDATE path must NOT touch `submitted_at` either (so we don't
  // un-submit an already-submitted report when the admin edits cash later).
  const { data: existing, error: lookupError } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('staff_id', parsed.data.staffId)
    .eq('report_date', parsed.data.date)
    .maybeSingle();

  if (lookupError) {
    console.error('[cash-issuance.setStaffCashIssuedAction] lookup failed', {
      adminId: auth.userId,
      staffId: parsed.data.staffId,
      date: parsed.data.date,
      message: lookupError.message,
    });
    return { error: safeError(lookupError, 'Could not save cash issued.') };
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('daily_reports')
      .update({
        cash_issued: parsed.data.amount,
        cash_issued_by: auth.userId,
        cash_issued_at: nowIso,
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('[cash-issuance.setStaffCashIssuedAction] update failed', {
        adminId: auth.userId,
        staffId: parsed.data.staffId,
        date: parsed.data.date,
        message: updateError.message,
      });
      return { error: safeError(updateError, 'Could not save cash issued.') };
    }
  } else {
    const { error: insertError } = await supabase
      .from('daily_reports')
      .insert({
        staff_id: parsed.data.staffId,
        report_date: parsed.data.date,
        cash_issued: parsed.data.amount,
        loan_issued: 0,
        submitted_at: null,
        cash_issued_by: auth.userId,
        cash_issued_at: nowIso,
      });

    if (insertError) {
      console.error('[cash-issuance.setStaffCashIssuedAction] insert failed', {
        adminId: auth.userId,
        staffId: parsed.data.staffId,
        date: parsed.data.date,
        message: insertError.message,
      });
      return { error: safeError(insertError, 'Could not save cash issued.') };
    }
  }

  revalidatePath('/admin/cash-issuance');
  revalidatePath('/staff/report');
  revalidatePath('/admin/reports');
  return { success: true };
}

export interface StaffCashIssuedRow {
  staff_id: string;
  full_name: string;
  email: string;
  cash_issued: number;
  has_submitted_report: boolean;
  last_updated: string | null;
}

/**
 * Returns one row per staff profile for the given date, joined with their
 * `daily_reports` row for that date (if any). Used by the admin cash-issuance
 * page to show every staff member and let admins set/edit their cash_issued
 * in one place.
 *
 * Why a left join in code instead of a Postgres view? We need the LEFT side
 * (profiles) to always appear even when no daily_reports row exists yet —
 * which is the whole point of this page (issuance happens BEFORE report
 * submission). The PostgREST embed shape with `daily_reports!left(...)` works
 * but pulls the entire row; doing it in two queries is clearer and lets us
 * filter the report side by date without RLS complications.
 */
export async function getStaffCashIssuedForDateAction(date: string): Promise<
  { error: string } | { data: StaffCashIssuedRow[] }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const dateParsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(date);
  if (!dateParsed.success) return { error: 'Invalid date.' };

  const supabase = await createAdminClient();

  const { data: staff, error: staffError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'staff')
    .order('full_name', { ascending: true });

  if (staffError) {
    console.error('[cash-issuance.getStaffCashIssuedForDateAction] profiles query failed', {
      adminId: auth.userId,
      date: dateParsed.data,
      message: staffError.message,
    });
    return { error: safeError(staffError, 'Could not load staff list.') };
  }

  const staffList = (staff ?? []) as Array<{ id: string; full_name: string; email: string }>;
  if (staffList.length === 0) return { data: [] };

  const staffIds = staffList.map((s) => s.id);

  const { data: reports, error: reportsError } = await supabase
    .from('daily_reports')
    .select('staff_id, cash_issued, submitted_at, cash_issued_at')
    .in('staff_id', staffIds)
    .eq('report_date', dateParsed.data);

  if (reportsError) {
    console.error('[cash-issuance.getStaffCashIssuedForDateAction] daily_reports query failed', {
      adminId: auth.userId,
      date: dateParsed.data,
      message: reportsError.message,
    });
    return { error: safeError(reportsError, 'Could not load cash issued.') };
  }

  const reportByStaff = new Map<
    string,
    { cash_issued: number | null; submitted_at: string | null; cash_issued_at: string | null }
  >();
  for (const r of (reports ?? []) as Array<{
    staff_id: string;
    cash_issued: number | null;
    submitted_at: string | null;
    cash_issued_at: string | null;
  }>) {
    reportByStaff.set(r.staff_id, {
      cash_issued: r.cash_issued,
      submitted_at: r.submitted_at,
      cash_issued_at: r.cash_issued_at,
    });
  }

  const rows: StaffCashIssuedRow[] = staffList.map((s) => {
    const r = reportByStaff.get(s.id);
    return {
      staff_id: s.id,
      full_name: s.full_name,
      email: s.email,
      cash_issued: Number(r?.cash_issued ?? 0),
      has_submitted_report: !!r?.submitted_at,
      last_updated: r?.cash_issued_at ?? null,
    };
  });

  return { data: rows };
}
