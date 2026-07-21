'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  FileSpreadsheet, Download, Loader2, CheckCircle2, Circle,
  HandCoins, Wallet, Scale, CalendarRange, ArrowRight, Info,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  financialYearOptions, generateAuditReport, downloadAuditWorkbook,
  type AuditTotals, type AuditProgress, type FyOption,
} from '@/lib/audit-report';
import type { WorkBook } from 'xlsx';

const REPORT_CONTENTS = [
  {
    icon: HandCoins,
    color: 'bg-blue-100 text-blue-600',
    title: 'Loans Granted',
    desc: 'Every loan issued in the year — capital and interest shown separately.',
  },
  {
    icon: Wallet,
    color: 'bg-emerald-100 text-emerald-600',
    title: 'Collections',
    desc: 'Every payment collected, split into capital and interest portions.',
  },
  {
    icon: Scale,
    color: 'bg-amber-100 text-amber-600',
    title: 'Outstanding Balances',
    desc: 'Capital and interest still to collect at the end of the year.',
  },
];

const GEN_STEPS = [
  { at: 5, label: 'Loading loans' },
  { at: 15, label: 'Computing balances' },
  { at: 20, label: 'Loading collections' },
  { at: 90, label: 'Building Excel file' },
];

export default function AdminAuditPage() {
  const fyOptions = useMemo(financialYearOptions, []);
  const [fy, setFy] = useState<FyOption>(fyOptions[0]);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [totals, setTotals] = useState<AuditTotals | null>(null);
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const generating = progress !== null && progress.pct < 100 && !totals;

  async function handleGenerate() {
    setTotals(null);
    setWorkbook(null);
    setProgress({ stage: 'Starting…', pct: 0 });
    try {
      const { totals: t, workbook: wb } = await generateAuditReport(fy, setProgress);
      setTotals(t);
      setWorkbook(wb);
      toast.success(`${fy.label} report is ready — press Download Excel`);
    } catch (e) {
      setProgress(null);
      toast.error(e instanceof Error ? e.message : 'Could not generate the report. Try again.');
    }
  }

  function handleDownload() {
    if (!workbook || !totals) return;
    downloadAuditWorkbook(workbook, totals.fy.label);
    toast.success('Excel file downloaded');
  }

  function pickYear(next: FyOption) {
    if (generating) return;
    setFy(next);
    setTotals(null);
    setWorkbook(null);
    setProgress(null);
  }

  return (
    <div className="min-h-full">
      {/* Hero — same language as the dashboard Overview band */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 text-white px-4 lg:px-8 pt-6 pb-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-blue-200 text-sm">For the external auditor</p>
          <h1 className="text-3xl font-bold flex items-center gap-3 mt-1">
            <FileSpreadsheet className="h-7 w-7" />
            Audit Reports
          </h1>
          <p className="text-blue-100 mt-2 max-w-2xl text-sm">
            Pick a financial year and get one Excel file with everything the auditor asks
            for — loans granted, collections and outstanding balances, with capital and
            interest shown separately.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 -mt-4 pb-10 space-y-5">

        {/* STEP 1 — choose the year */}
        <section className="bg-white rounded-2xl border shadow-sm p-4 lg:p-6">
          <StepHeading step={1} title="Choose the financial year" />
          <div className="flex flex-wrap gap-2 mt-3">
            {fyOptions.map((o, i) => {
              const active = o.label === fy.label;
              return (
                <button
                  key={o.label}
                  onClick={() => pickYear(o)}
                  disabled={generating}
                  className={
                    'rounded-xl border px-4 py-3 text-left transition min-w-[150px] ' +
                    (active
                      ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600/20'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50')
                  }
                >
                  <span className="flex items-center gap-2">
                    <CalendarRange className={'h-4 w-4 ' + (active ? 'text-blue-600' : 'text-gray-400')} />
                    <span className={'font-semibold text-sm ' + (active ? 'text-blue-700' : 'text-gray-800')}>
                      {o.label}
                    </span>
                    {i === 0 && (
                      <span className="text-[10px] font-medium bg-blue-600 text-white rounded-full px-2 py-0.5">
                        Current
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-1">
                    01 Apr {o.start.slice(0, 4)} – 31 Mar {o.end.slice(0, 4)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* What the report contains — visible before generating so the page
              explains itself to a first-time admin */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {REPORT_CONTENTS.map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="flex gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
                <div className={'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ' + color}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* STEP 2 — generate */}
        <section className="bg-white rounded-2xl border shadow-sm p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <StepHeading step={2} title={`Generate the ${fy.label} report`} />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white px-6 py-3 text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {generating
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowRight className="h-4 w-4" />}
              {generating ? 'Generating…' : totals ? 'Generate again' : 'Generate report'}
            </button>
          </div>

          {generating && progress && (
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="space-y-2">
                {GEN_STEPS.map((s, i) => {
                  const next = GEN_STEPS[i + 1];
                  const done = progress.pct >= (next ? next.at : 100);
                  const activeStep = !done && progress.pct >= s.at;
                  return (
                    <div key={s.label} className="flex items-center gap-2 text-sm">
                      {done
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        : activeStep
                          ? <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
                          : <Circle className="h-4 w-4 text-gray-300 shrink-0" />}
                      <span className={done ? 'text-gray-500' : activeStep ? 'text-blue-700 font-medium' : 'text-gray-400'}>
                        {activeStep ? progress.stage : s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="h-2 rounded-full bg-white overflow-hidden mt-4 border border-blue-100">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          )}

          {!generating && !totals && (
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Takes 10–60 seconds depending on the year. Nothing is changed in the system —
              this only reads data.
            </p>
          )}
        </section>

        {/* STEP 3 — results + download */}
        {totals && (
          <section className="space-y-5">
            {/* Ready banner with the main CTA */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 lg:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-900">
                    {totals.fy.label} report is ready
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Excel file with 5 sheets: Summary · Loan Issue · Collections · Outstanding · Notes
                  </p>
                </div>
              </div>
              <button
                onClick={handleDownload}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-6 py-3 text-sm font-semibold shadow-sm hover:bg-emerald-700 transition shrink-0"
              >
                <Download className="h-4 w-4" />
                Download Excel
              </button>
            </div>

            {/* Key numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                icon={<HandCoins className="h-5 w-5" />}
                chip="bg-blue-100 text-blue-600"
                title="Loans Granted"
                main={`${totals.loansIssued.toLocaleString()} loans`}
                lines={[
                  ['Capital', totals.grantedCapital],
                  ['Interest', totals.grantedInterest],
                  ['Total', totals.grantedCapital + totals.grantedInterest],
                ]}
              />
              <StatCard
                icon={<Wallet className="h-5 w-5" />}
                chip="bg-emerald-100 text-emerald-600"
                title="Collections"
                main={`${totals.collectionRows.toLocaleString()} payments`}
                lines={[
                  ['Capital', totals.collectedCapital],
                  ['Interest', totals.collectedInterest],
                  ['Total', totals.collectedAmount],
                ]}
              />
              <StatCard
                icon={<Scale className="h-5 w-5" />}
                chip="bg-amber-100 text-amber-600"
                title="Still to Collect"
                main={`${totals.openPositions.toLocaleString()} open loans`}
                lines={[
                  ['Capital', totals.osCapital],
                  ['Interest', totals.osInterest],
                  ['Total', totals.osCapital + totals.osInterest],
                ]}
              />
            </div>

            {/* Center-wise table */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="px-4 lg:px-6 py-4 border-b">
                <h2 className="font-semibold text-sm text-gray-900">
                  By center — {totals.centers.length} centers
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The same figures appear on the Summary sheet of the Excel file.
                </p>
              </div>
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Center</th>
                      <th className="px-3 py-2.5 font-medium text-right">Loans</th>
                      <th className="px-3 py-2.5 font-medium text-right">Granted</th>
                      <th className="px-3 py-2.5 font-medium text-right">Collected</th>
                      <th className="px-3 py-2.5 font-medium text-right">Cap. Collected</th>
                      <th className="px-3 py-2.5 font-medium text-right">Int. Collected</th>
                      <th className="px-4 py-2.5 font-medium text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {totals.centers.map((r) => (
                      <tr key={r.center} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{r.center}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.grantedCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.grantedCapital + r.grantedInterest)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.collectedAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.collectedCapital)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.collectedInterest)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.osCapital + r.osInterest)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 font-semibold sticky bottom-0">
                    <tr>
                      <td className="px-4 py-2.5">TOTAL</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{totals.loansIssued}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.grantedCapital + totals.grantedInterest)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.collectedAmount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.collectedCapital)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.collectedInterest)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totals.osCapital + totals.osInterest)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              How the capital/interest split works: each payment is divided in the same
              proportion as the loan itself (interest = amount × loan interest ÷ loan total).
              This is the method agreed with the audit team.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function StepHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-7 w-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
        {step}
      </span>
      <h2 className="font-semibold text-gray-900">{title}</h2>
    </div>
  );
}

function StatCard({
  icon, chip, title, main, lines,
}: {
  icon: React.ReactNode;
  chip: string;
  title: string;
  main: string;
  lines: [string, number][];
}) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4 lg:p-5">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={'h-9 w-9 rounded-lg flex items-center justify-center ' + chip}>
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-muted-foreground">{main}</p>
        </div>
      </div>
      <div className="space-y-1.5 mt-3">
        {lines.map(([label, value], i) => (
          <div
            key={label}
            className={'flex justify-between text-xs ' + (i === lines.length - 1 ? 'pt-1.5 border-t font-semibold' : '')}
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{formatCurrency(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
