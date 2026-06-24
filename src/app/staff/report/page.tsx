'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Download, FileText, TrendingUp, Banknote, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateDailyReportPDF, ReportCenter } from '@/lib/pdf-report';
import { saveReportAction, getStaffReportDataAction } from '@/app/actions/reports';
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
  const [cashIssued, setCashIssued] = useState('0');
  const [loanIssued, setLoanIssued] = useState('0');
  const [saving, setSaving] = useState(false);

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

    if (result.data.existing_cash_issued !== null) {
      setCashIssued(result.data.existing_cash_issued.toString());
    }
    const totalLoanIssued = result.data.centers.reduce((s, c) => s + c.loan_issued, 0);
    if (totalLoanIssued > 0) setLoanIssued(totalLoanIssued.toString());

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
