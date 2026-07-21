'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  FileSpreadsheet, Download, Loader2, TrendingUp, TrendingDown,
  Wallet, CircleDollarSign, RefreshCw,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  financialYearOptions, generateAuditReport, downloadAuditWorkbook,
  type AuditTotals, type AuditProgress, type FyOption,
} from '@/lib/audit-report';
import type { WorkBook } from 'xlsx';

export default function AdminAuditPage() {
  const fyOptions = useMemo(financialYearOptions, []);
  const [fy, setFy] = useState<FyOption>(fyOptions[0]);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [totals, setTotals] = useState<AuditTotals | null>(null);
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const generating = progress !== null && progress.pct < 100;

  async function handleGenerate() {
    setTotals(null);
    setWorkbook(null);
    setProgress({ stage: 'Starting…', pct: 0 });
    try {
      const { totals: t, workbook: wb } = await generateAuditReport(fy, setProgress);
      setTotals(t);
      setWorkbook(wb);
      toast.success(`${fy.label} audit report ready`);
    } catch (e) {
      setProgress(null);
      toast.error(e instanceof Error ? e.message : 'Report generation failed.');
    }
  }

  function handleDownload() {
    if (!workbook || !totals) return;
    downloadAuditWorkbook(workbook, totals.fy.label);
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Audit Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financial-year reports for the external auditor — loan grants, collections
            (capital/interest split) and outstanding balances.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border shadow-sm p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 max-w-xs">
            <label htmlFor="fy" className="block text-sm font-medium text-gray-700 mb-1.5">
              Financial Year (1 Apr – 31 Mar)
            </label>
            <select
              id="fy"
              value={fy.label}
              disabled={generating}
              onChange={(e) => {
                const next = fyOptions.find((o) => o.label === e.target.value);
                if (next) { setFy(next); setTotals(null); setWorkbook(null); }
              }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {fyOptions.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label} ({o.start} → {o.end})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-sm hover:opacity-90 disabled:opacity-50 transition"
            >
              {generating
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : totals ? <RefreshCw className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
              {generating ? 'Generating…' : totals ? 'Re-generate' : 'Generate Report'}
            </button>
            {workbook && (
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-emerald-700 transition"
              >
                <Download className="h-4 w-4" />
                Download Excel
              </button>
            )}
          </div>
        </div>

        {progress && progress.pct < 100 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{progress.stage}</span>
              <span>{progress.pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Totals */}
      {totals && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
              title="Loans Granted"
              main={`${totals.loansIssued.toLocaleString()} loans`}
              lines={[
                ['Capital', totals.grantedCapital],
                ['Interest', totals.grantedInterest],
                ['Total', totals.grantedCapital + totals.grantedInterest],
              ]}
            />
            <StatCard
              icon={<Wallet className="h-5 w-5 text-emerald-600" />}
              title="Collections"
              main={`${totals.collectionRows.toLocaleString()} rows`}
              lines={[
                ['Capital', totals.collectedCapital],
                ['Interest', totals.collectedInterest],
                ['Total', totals.collectedAmount],
              ]}
            />
            <StatCard
              icon={<TrendingDown className="h-5 w-5 text-amber-600" />}
              title="Outstanding at FY End"
              main={`${totals.openPositions.toLocaleString()} open loans`}
              lines={[
                ['Capital O/S', totals.osCapital],
                ['Interest O/S', totals.osInterest],
                ['Total O/S', totals.osCapital + totals.osInterest],
              ]}
            />
          </div>

          {/* Center summary table */}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-4 lg:px-6 py-4 border-b flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm text-gray-900">
                Center Summary — {totals.fy.label} ({totals.centers.length} centers)
              </h2>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Center</th>
                    <th className="px-3 py-2.5 font-medium text-right">Loans</th>
                    <th className="px-3 py-2.5 font-medium text-right">Cap. Granted</th>
                    <th className="px-3 py-2.5 font-medium text-right">Int. Granted</th>
                    <th className="px-3 py-2.5 font-medium text-right">Collected</th>
                    <th className="px-3 py-2.5 font-medium text-right">Cap. Coll.</th>
                    <th className="px-3 py-2.5 font-medium text-right">Int. Coll.</th>
                    <th className="px-3 py-2.5 font-medium text-right">O/S Cap.</th>
                    <th className="px-4 py-2.5 font-medium text-right">O/S Int.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {totals.centers.map((r) => (
                    <tr key={r.center} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{r.center}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.grantedCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.grantedCapital)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.grantedInterest)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.collectedAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.collectedCapital)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.collectedInterest)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.osCapital)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.osInterest)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 font-semibold">
                  <tr>
                    <td className="px-4 py-2.5">TOTAL</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.loansIssued}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.grantedCapital)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.grantedInterest)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.collectedAmount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.collectedCapital)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.collectedInterest)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.osCapital)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totals.osInterest)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Split method: interest = amount × (loan interest ÷ loan total), capital = remainder —
            the proportional allocation agreed with the audit team. The Excel download contains
            Summary, Loan Issue, Collections, Outstanding and Notes sheets.
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon, title, main, lines,
}: {
  icon: React.ReactNode;
  title: string;
  main: string;
  lines: [string, number][];
}) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4 lg:p-5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <p className="text-lg font-bold text-gray-900 mb-2">{main}</p>
      <div className="space-y-1">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{formatCurrency(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
