'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Download, FileText, TrendingUp, Banknote, ArrowUpRight, Lock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateDailyReportPDF, ReportCenter } from '@/lib/pdf-report';
import { saveReportAction, getStaffReportDataAction, UncollectedCenterGroup } from '@/app/actions/reports';
import { formatCurrency, formatDate, getTodayString } from '@/lib/utils';

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
  const [existingCashIssued, setExistingCashIssued] = useState<number | null>(null);
  const [loanIssued, setLoanIssued] = useState('0');
  const [saving, setSaving] = useState(false);
  const [uncollected, setUncollected] = useState<UncollectedCenterGroup[]>([]);

  const today = getTodayString();

  useEffect(() => {
    loadReportData();
  }, []);

  async function loadReportData() {
    // Server action — uses the admin client so RLS doesn't hide completed-today
    // loans (whose payments are real cash in hand). See getStaffReportDataAction
    // docstring for the full rationale.
    const result = await getStaffReportDataAction();

    if ('error' in result) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    setStaffName(result.data.staff_name);
    setCenters(
      result.data.centers.map((c) => ({
        center_name: c.center_name,
        center_number: c.center_number,
        expected_collection: c.expected_collection,
        collection_amount: c.collection_amount,
        cleared_amount: c.cleared_amount,
        loan_issued: c.loan_issued,
      })),
    );

    setExistingCashIssued(result.data.existing_cash_issued);
    const totalLoanIssued = result.data.centers.reduce((s, c) => s + c.loan_issued, 0);
    if (totalLoanIssued > 0) setLoanIssued(totalLoanIssued.toString());

    setLoading(false);
  }

  const totalExpected = centers.reduce((s, c) => s + c.expected_collection, 0);
  const totalCollected = centers.reduce((s, c) => s + c.collection_amount, 0);
  const cashIssuedNum = existingCashIssued ?? 0;
  const hasCashIssued = existingCashIssued !== null && existingCashIssued > 0;
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
    fd.append('loan_issued', loanIssued);

    // Only touch the uncollected list once a response actually arrives — a
    // dropped connection must not wipe the staff member's to-do list or leave
    // the button stuck on "Submitting…".
    try {
      const result = await saveReportAction(fd);
      if (result?.error) {
        if (result.uncollected && result.uncollected.length > 0) {
          // Grouped per-center list renders below — keep the toast short.
          setUncollected(result.uncollected);
          toast.error('Payment records missing — check the list below');
        } else {
          setUncollected([]);
          toast.error(result.error);
        }
        return;
      }
      setUncollected([]);
      toast.success('Report submitted successfully!');
    } catch {
      toast.error('Connection error — report not submitted. Try again.');
    } finally {
      setSaving(false);
    }
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
            <p className="text-xs text-muted-foreground">Cash issuance controlled by admin</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {/* Cash Issued — read-only, set by admin */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Cash Issued (Rs.)</Label>

            {hasCashIssued ? (
              <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 shadow-sm">
                <div className="rounded-[14px] bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Lock className="h-3 w-3 text-emerald-700" />
                        <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
                          Admin Issued
                        </span>
                      </div>
                      <p className="text-2xl font-black text-emerald-900 tracking-tight">
                        {formatCurrency(cashIssuedNum)}
                      </p>
                      <p className="text-[11px] text-emerald-700/80 mt-1">
                        Set by admin · cannot be edited here
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shrink-0">
                      <Banknote className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 shadow-sm">
                <div className="rounded-[14px] bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shrink-0">
                      <AlertTriangle className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Lock className="h-3 w-3 text-amber-800" />
                        <span className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">
                          Pending
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-amber-900 leading-snug">
                        Admin has not yet recorded cash issued for today
                      </p>
                      <p className="text-[12px] text-amber-800/90 mt-1 leading-snug" lang="si">
                        අද දින cash issuance එක admin විසින් තවම සටහන් කර නැත
                      </p>
                      <p className="text-[11px] text-amber-700/80 mt-2">
                        Set by admin · cannot be edited here
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
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

      {/* Uncollected members — grouped by center (submit validation) */}
      {uncollected.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-red-100 bg-red-50/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-semibold text-red-900">Uncollected Members</h2>
              <p className="text-xs text-red-700/90 leading-snug" lang="si">
                submit කිරීමට පෙර පහත members Paid/Shortfall/N/P ලෙස සටහන් කරන්න
              </p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {uncollected.map((g) => (
              <div key={`${g.center_number}-${g.center_name}`} className="rounded-xl border border-red-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-red-50/60 border-b border-red-100 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-red-900 truncate">{g.center_name}</p>
                  <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full shrink-0">
                    Center {g.center_number} · {g.members.length}
                  </span>
                </div>
                <ul className="px-4 py-2.5 space-y-1.5">
                  {g.members.map((name, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

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
