'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTodayString } from '@/lib/utils';
import { safeError } from '@/lib/safe-error';
import { TODAY_DAY_OF_WEEK } from '@/types';
import { z } from 'zod';

const reportSchema = z.object({
  cash_issued: z.coerce.number().min(0),
  loan_issued: z.coerce.number().min(0),
});

export async function saveReportAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = reportSchema.safeParse({
    cash_issued: formData.get('cash_issued'),
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
    const { data: updated, error: updateError } = await supabase
      .from('daily_reports')
      .update({
        cash_issued: parsed.data.cash_issued,
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
      // RLS blocked update — delete + re-insert
      await supabase.from('daily_reports').delete().eq('staff_id', user.id).eq('report_date', today);
      const { error: insertError } = await supabase.from('daily_reports').insert({
        staff_id: user.id,
        report_date: today,
        cash_issued: parsed.data.cash_issued,
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
    const { error: insertError } = await supabase.from('daily_reports').insert({
      staff_id: user.id,
      report_date: today,
      cash_issued: parsed.data.cash_issued,
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
