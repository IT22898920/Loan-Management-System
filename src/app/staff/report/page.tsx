'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Download, FileText, TrendingUp, Banknote, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { generateDailyReportPDF, ReportCenter } from '@/lib/pdf-report';
import { saveReportAction } from '@/app/actions/reports';
import { formatCurrency, formatDate, getTodayString } from '@/lib/utils';
import { TODAY_DAY_OF_WEEK } from '@/types';

interface CenterReport {
  center_name: string;
  center_number: number;
  expected_collection: number;
  collection_amount: number;
  cleared_amount: number;
  loan_issued: number;
}

export default function StaffReportPage() {
  const [loading, setLoading] = useState(true);
  const [centers, setCenters] = useState<CenterReport[]>([]);
  const [staffName, setStaffName] = useState('');
  const [cashIssued, setCashIssued] = useState('0');
  const [loanIssued, setLoanIssued] = useState('0');
  const [saving, setSaving] = useState(false);

  const today = getTodayString();
  const todayDay = TODAY_DAY_OF_WEEK();

  // Calculate start of current week (Monday) — loans issued this week are excluded from expected
  const todayDate = new Date(today);
  const daysFromMonday = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1;
  const weekStartDate = new Date(todayDate);
  weekStartDate.setDate(todayDate.getDate() - daysFromMonday);
  const weekStartString = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    loadReportData();
  }, []);

  async function loadReportData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const assignmentsQuery = todayDay
      ? supabase
          .from('staff_center_assignments')
          .select('center:centers(id, name, center_number)')
          .eq('staff_id', user.id)
          .eq('day_of_week', todayDay)
      : Promise.resolve({ data: null });

    const [{ data: profile }, { data: assignments }, { data: todayLoans }, { data: existingReport }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      assignmentsQuery,
      supabase.from('loans').select('principal, member:members!inner(center_id)').eq('created_by', user.id).eq('issued_date', today),
      supabase.from('daily_reports').select('cash_issued, loan_issued').eq('staff_id', user.id).eq('report_date', today).single(),
    ]);

    setStaffName(profile?.full_name ?? '');

    // Pre-fill from existing submitted report if available
    if (existingReport) {
      setCashIssued(existingReport.cash_issued?.toString() ?? '0');
    }

    const totalLoanIssued = (todayLoans ?? []).reduce((s: number, l: { principal: number | null }) => s + (l.principal ?? 0), 0);
    if (totalLoanIssued > 0) setLoanIssued(totalLoanIssued.toString());

    // Per-center loan issued map
    const loanIssuedByCenter: Record<string, number> = {};
    for (const l of (todayLoans ?? []) as unknown as { principal: number | null; member: { center_id: string } }[]) {
      const cid = l.member.center_id;
      loanIssuedByCenter[cid] = (loanIssuedByCenter[cid] ?? 0) + (l.principal ?? 0);
    }

    const assignedCenters = (assignments ?? [])
      .map((a) => a.center as unknown as { id: string; name: string; center_number: number } | null)
      .filter(Boolean) as { id: string; name: string; center_number: number }[];

    const centerReports: CenterReport[] = [];

    for (const center of assignedCenters) {
      const { data: loans } = await supabase
        .from('loans')
        .select('id, weekly_payment, issued_date, status, members!inner(center_id)')
        .eq('members.center_id', center.id);

      // Expected: only ACTIVE loans issued BEFORE this week
      const expectedCollection = (loans ?? [])
        .filter((l: { status: string; issued_date: string }) => l.status === 'active' && l.issued_date < weekStartString)
        .reduce((s: number, l: { weekly_payment: number }) => s + l.weekly_payment, 0);

      // Collection: ALL loans (active + completed) — completed-today loans must not be missed
      const loanIds = (loans ?? []).map((l: { id: string }) => l.id);
      const loanStatusById = new Map(
        (loans ?? []).map((l: { id: string; status: string }) => [l.id, l.status])
      );

      let collectionAmount = 0;
      let clearedAmount = 0;
      if (loanIds.length > 0) {
        const { data: payments } = await supabase
          .from('payments')
          .select('loan_id, amount_paid')
          .in('loan_id', loanIds)
          .eq('staff_id', user.id)
          .eq('payment_date', today);

        for (const p of payments ?? []) {
          collectionAmount += p.amount_paid;
          if (loanStatusById.get(p.loan_id) !== 'active') {
            clearedAmount += p.amount_paid;
          }
        }
      }

      centerReports.push({
        center_name: center.name,
        center_number: center.center_number,
        expected_collection: expectedCollection,
        collection_amount: collectionAmount,
        cleared_amount: clearedAmount,
        loan_issued: loanIssuedByCenter[center.id] ?? 0,
      });
    }

    setCenters(centerReports);
    setLoading(false);
  }

  const totalExpected = centers.reduce((s, c) => s + c.expected_collection, 0);
  const totalCollected = centers.reduce((s, c) => s + c.collection_amount, 0);
  const cashIssuedNum = parseFloat(cashIssued) || 0;
  const loanIssuedNum = parseFloat(loanIssued) || 0;
  const totalCashBalance = cashIssuedNum + totalCollected - loanIssuedNum;
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  function handleDownloadPDF() {
    generateDailyReportPDF({
      staff_name: staffName,
      report_date: today,
      centers: centers,
      cash_issued: cashIssuedNum,
      loan_issued: loanIssuedNum,
    });
    toast.success('PDF downloaded!');
  }

  async function handleSubmit() {
    setSaving(true);

    const fd = new FormData();
    fd.append('cash_issued', cashIssued);
    fd.append('loan_issued', loanIssued);

    const result = await saveReportAction(fd);
    setSaving(false);

    if (result?.error) { toast.error(result.error); return; }
    toast.success('Report submitted successfully!');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white -mx-4 px-4 pt-5 pb-6 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Daily Report</h1>
            <p className="text-blue-200 text-sm">{formatDate(today)}</p>
          </div>
        </div>

        {/* Key stats */}
        <div className="flex gap-3 flex-wrap">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20">
            <p className="text-[10px] text-blue-200">Collected</p>
            <p className="font-bold">{formatCurrency(totalCollected)}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20">
            <p className="text-[10px] text-blue-200">Expected</p>
            <p className="font-bold">{formatCurrency(totalExpected)}</p>
          </div>
          <div className={`backdrop-blur-sm rounded-xl px-4 py-2.5 border ${
            collectionRate >= 90 ? 'bg-green-500/20 border-green-300/30' : 'bg-amber-500/20 border-amber-300/30'
          }`}>
            <p className="text-[10px] text-blue-200">Rate</p>
            <p className="font-bold">{collectionRate}%</p>
          </div>
        </div>
      </div>

      {/* Collection table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="font-semibold text-gray-900">Collection Summary</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Center</th>
                <th className="text-center px-2 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">#</th>
                <th className="text-right px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Expected</th>
                <th className="text-right px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Collected</th>
                <th className="text-right px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Loan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {centers.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50/40">
                  <td className="px-4 py-3.5 font-medium text-gray-800">{c.center_name}</td>
                  <td className="px-2 py-3.5 text-center text-muted-foreground">{c.center_number}</td>
                  <td className="px-3 py-3.5 text-right text-muted-foreground">{formatCurrency(c.expected_collection)}</td>
                  <td className="px-3 py-3.5 text-right font-semibold text-gray-900">
                    {formatCurrency(c.collection_amount)}
                    {c.cleared_amount > 0 && (
                      <span className="block text-[10px] font-medium text-emerald-600 mt-0.5">
                        incl. {formatCurrency(c.cleared_amount)} cleared
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-blue-700">
                    {c.loan_issued > 0 ? formatCurrency(c.loan_issued) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50 border-t-2 border-blue-100">
                <td className="px-4 py-3.5 font-bold text-primary" colSpan={2}>TOTAL</td>
                <td className="px-3 py-3.5 text-right font-bold text-primary">{formatCurrency(totalExpected)}</td>
                <td className="px-3 py-3.5 text-right font-bold text-primary">{formatCurrency(totalCollected)}</td>
                <td className="px-4 py-3.5 text-right font-bold text-blue-700">{formatCurrency(centers.reduce((s, c) => s + c.loan_issued, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Cash details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
            <Banknote className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Cash Details</h2>
            <p className="text-xs text-muted-foreground">Enter amounts manually</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Cash Issued (Rs.)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={cashIssued}
              onChange={(e) => setCashIssued(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-gray-600">Loan Issued (Rs.)</Label>
              <span className="text-[10px] text-blue-500 font-medium bg-blue-50 px-2 py-0.5 rounded-full">Auto-filled</span>
            </div>
            <Input
              type="number"
              value={loanIssued}
              readOnly
              className="rounded-xl bg-gray-50 text-gray-600 cursor-not-allowed"
            />
          </div>

          {/* Auto-calculated summary */}
          <div className="pt-3 border-t border-gray-100 space-y-2.5">
            {/* Cash In */}
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cash In</p>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Cash Issued (Starting)</span>
              <span className="font-medium text-green-700">+ {formatCurrency(cashIssuedNum)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Loan Repayments</span>
              <span className="font-medium text-green-700">+ {formatCurrency(totalCollected)}</span>
            </div>

            {/* Cash Out */}
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1">Cash Out</p>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Loan Issued</span>
              <span className="font-medium text-red-600">− {formatCurrency(loanIssuedNum)}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="font-bold text-gray-900">Total Cash Balance</span>
              <span className={`font-black text-lg ${totalCashBalance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {formatCurrency(totalCashBalance)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 rounded-2xl h-14 text-base font-semibold border-2"
          size="lg"
          onClick={handleDownloadPDF}
        >
          <Download className="h-5 w-5 mr-2" />Download PDF
        </Button>
        <Button
          className="flex-1 rounded-2xl h-14 text-base font-semibold"
          size="lg"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" />Submitting...</>
          ) : (
            <><ArrowUpRight className="h-5 w-5 mr-2" />Submit Report</>
          )}
        </Button>
      </div>
    </div>
  );
}
