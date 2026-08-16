'use client';

/**
 * Admin audit report generator — builds the external-auditor Excel workbook
 * (Summary / Loan Issue / Collections / Outstanding / Notes) for a financial
 * year (1 Apr – 31 Mar) entirely client-side from admin-only RPC data.
 *
 * Capital/Interest split methodology: proportional allocation —
 * interest portion = amount x (loan interest / loan total), capital = rest.
 * Matches the format agreed with the external audit team (Jul 2026).
 */
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { loanRef } from '@/lib/loan-ref';

export interface FyOption {
  label: string;   // e.g. "FY2023-24"
  start: string;   // "2023-04-01"
  end: string;     // "2024-03-31"
}

export interface AuditProgress {
  stage: string;
  pct: number; // 0-100
}

interface AuditLoan {
  id: string;
  principal: number | null;
  interest: number | null;
  issued_date: string;
  status: string;
  is_first_loan: boolean;
  cycle_no: number | null;
  weekly_payment: number | null;
  member_no: string;
  client: string;
  center: string;
}

interface AuditPaymentRow {
  id: string;
  d: string;
  amt: number | null;
  np: boolean;
  sf: number | null;
  loan_id: string;
}

export interface CenterSummaryRow {
  center: string;
  grantedCount: number;
  grantedCapital: number;
  grantedInterest: number;
  collectedAmount: number;
  collectedCapital: number;
  collectedInterest: number;
  osCapital: number;
  osInterest: number;
}

export interface AuditTotals {
  fy: FyOption;
  loansIssued: number;
  grantedCapital: number;
  grantedInterest: number;
  collectionRows: number;
  collectedAmount: number;
  collectedCapital: number;
  collectedInterest: number;
  openPositions: number;
  osCapital: number;
  osInterest: number;
  centers: CenterSummaryRow[];
}

const COLLECTION_PAGE = 10000;

/** FY options from FY2023-24 up to the current Asia/Colombo financial year. */
export function financialYearOptions(): FyOption[] {
  const colomboToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // YYYY-MM-DD
  const y = Number(colomboToday.slice(0, 4));
  const m = Number(colomboToday.slice(5, 7));
  const currentStart = m >= 4 ? y : y - 1;
  const options: FyOption[] = [];
  for (let s = 2023; s <= currentStart; s++) {
    options.push({
      label: `FY${s}-${String((s + 1) % 100).padStart(2, '0')}`,
      start: `${s}-04-01`,
      end: `${s + 1}-03-31`,
    });
  }
  return options.reverse(); // newest first
}

function loanTotal(l: AuditLoan): number {
  return (l.principal ?? 0) + (l.interest ?? 0);
}

function splitInterest(amount: number, l: AuditLoan): number {
  const tot = loanTotal(l);
  if (tot <= 0) return 0;
  return Math.round(amount * ((l.interest ?? 0) / tot) * 100) / 100;
}

export async function generateAuditReport(
  fy: FyOption,
  onProgress: (p: AuditProgress) => void,
): Promise<{ totals: AuditTotals; workbook: XLSX.WorkBook }> {
  const supabase = createClient();

  onProgress({ stage: 'Loading loans…', pct: 5 });
  const { data: loansJson, error: loansErr } = await supabase.rpc('audit_loans_json');
  if (loansErr) throw new Error(`Loans fetch failed: ${loansErr.message}`);
  const loans = (loansJson ?? []) as AuditLoan[];
  const loanById = new Map(loans.map((l) => [l.id, l]));

  onProgress({ stage: 'Computing balances at FY end…', pct: 15 });
  const { data: cumJson, error: cumErr } = await supabase.rpc('audit_cum_paid_json', {
    cutoff: fy.end,
  });
  if (cumErr) throw new Error(`Cumulative fetch failed: ${cumErr.message}`);
  const cumPaid = (cumJson ?? {}) as Record<string, number>;

  onProgress({ stage: 'Counting collections…', pct: 20 });
  const { data: countData, error: cntErr } = await supabase.rpc('audit_collections_count', {
    fy_start: fy.start, fy_end: fy.end,
  });
  if (cntErr) throw new Error(`Count failed: ${cntErr.message}`);
  const totalRows = Number(countData ?? 0);

  // Keyset pagination on (payment_date, id): stable under concurrent inserts —
  // a payment recorded mid-generation is cleanly included or excluded, never
  // duplicated. totalRows only drives the progress bar denominator.
  const fetched: AuditPaymentRow[] = [];
  let afterDate: string | null = null;
  let afterId: string | null = null;
  for (;;) {
    const { data: pageJson, error: pageErr } = await supabase.rpc('audit_collections_json', {
      fy_start: fy.start, fy_end: fy.end,
      p_after_date: afterDate, p_after_id: afterId, p_limit: COLLECTION_PAGE,
    });
    if (pageErr) throw new Error(`Collections page failed after ${fetched.length}: ${pageErr.message}`);
    const page = (pageJson ?? []) as AuditPaymentRow[];
    if (page.length === 0) break;
    fetched.push(...page);
    const last = page[page.length - 1];
    afterDate = last.d;
    afterId = last.id;
    onProgress({
      stage: `Loading collections… ${fetched.length.toLocaleString()} / ${Math.max(totalRows, fetched.length).toLocaleString()}`,
      pct: 20 + Math.round((fetched.length / Math.max(totalRows, fetched.length, 1)) * 55),
    });
    if (page.length < COLLECTION_PAGE) break;
  }

  // Drop rows whose loan is missing from the loans snapshot (loan created and
  // paid in the seconds between the two fetches) so every sheet, total and
  // count is computed from the same consistent row set.
  const payments = fetched.filter((p) => loanById.has(p.loan_id));

  onProgress({ stage: 'Computing report…', pct: 80 });

  const fyStart = fy.start;
  const fyEnd = fy.end;
  const issued = loans
    .filter((l) => l.issued_date >= fyStart && l.issued_date <= fyEnd)
    .sort((a, b) => a.issued_date.localeCompare(b.issued_date) || a.center.localeCompare(b.center));

  const outstanding = loans
    .filter((l) => {
      const tot = loanTotal(l);
      if (l.issued_date > fyEnd || tot <= 0) return false;
      const paid = Math.min(cumPaid[l.id] ?? 0, tot);
      return tot - paid > 0.005;
    })
    .sort((a, b) => a.center.localeCompare(b.center) || a.member_no.localeCompare(b.member_no));

  // Center-wise aggregation
  const centerMap = new Map<string, CenterSummaryRow>();
  const centerRow = (name: string): CenterSummaryRow => {
    let row = centerMap.get(name);
    if (!row) {
      row = {
        center: name, grantedCount: 0, grantedCapital: 0, grantedInterest: 0,
        collectedAmount: 0, collectedCapital: 0, collectedInterest: 0,
        osCapital: 0, osInterest: 0,
      };
      centerMap.set(name, row);
    }
    return row;
  };

  for (const l of issued) {
    const r = centerRow(l.center);
    r.grantedCount += 1;
    r.grantedCapital += l.principal ?? 0;
    r.grantedInterest += l.interest ?? 0;
  }

  let collectedAmount = 0;
  let collectedInterest = 0;
  for (const p of payments) {
    const l = loanById.get(p.loan_id);
    if (!l) continue;
    const amt = p.amt ?? 0;
    const int = splitInterest(amt, l);
    const r = centerRow(l.center);
    r.collectedAmount += amt;
    r.collectedCapital += amt - int;
    r.collectedInterest += int;
    collectedAmount += amt;
    collectedInterest += int;
  }

  let osCapital = 0;
  let osInterest = 0;
  for (const l of outstanding) {
    const tot = loanTotal(l);
    const paid = Math.min(cumPaid[l.id] ?? 0, tot);
    const colCap = Math.round(paid * ((l.principal ?? 0) / tot) * 100) / 100;
    const oc = (l.principal ?? 0) - colCap;
    const oi = (l.interest ?? 0) - (paid - colCap);
    const r = centerRow(l.center);
    r.osCapital += oc;
    r.osInterest += oi;
    osCapital += oc;
    osInterest += oi;
  }

  const centers = [...centerMap.values()].sort((a, b) => a.center.localeCompare(b.center));

  const totals: AuditTotals = {
    fy,
    loansIssued: issued.length,
    grantedCapital: issued.reduce((s, l) => s + (l.principal ?? 0), 0),
    grantedInterest: issued.reduce((s, l) => s + (l.interest ?? 0), 0),
    collectionRows: payments.length,
    collectedAmount,
    collectedCapital: collectedAmount - collectedInterest,
    collectedInterest,
    openPositions: outstanding.length,
    osCapital,
    osInterest,
    centers,
  };

  onProgress({ stage: 'Building Excel workbook…', pct: 90 });

  const generatedAt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date());
  const src = `Generated from the DIRIYALANKA loan management system on ${generatedAt} (Asia/Colombo).`;

  const wb = XLSX.utils.book_new();

  // ── Summary ───────────────────────────────────────────────
  const sumAoa: (string | number)[][] = [
    [`SUMMARY BY CENTER — ${fy.label}`],
    [src],
    [],
    ['No', 'Center', 'Loans Granted', 'Capital Granted', 'Interest Granted',
     'Amount Collected', 'Capital Collected', 'Interest Collected',
     'O/S Capital (FY End)', 'O/S Interest (FY End)', 'O/S Total'],
    ...centers.map((r, i) => [
      i + 1, r.center, r.grantedCount, round2(r.grantedCapital), round2(r.grantedInterest),
      round2(r.collectedAmount), round2(r.collectedCapital), round2(r.collectedInterest),
      round2(r.osCapital), round2(r.osInterest), round2(r.osCapital + r.osInterest),
    ]),
    ['', 'TOTAL',
     totals.loansIssued, round2(totals.grantedCapital), round2(totals.grantedInterest),
     round2(totals.collectedAmount), round2(totals.collectedCapital), round2(totals.collectedInterest),
     round2(totals.osCapital), round2(totals.osInterest), round2(totals.osCapital + totals.osInterest)],
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(sumAoa);
  wsSum['!cols'] = [{ wch: 5 }, { wch: 30 }, ...Array(9).fill({ wch: 15 })];
  moneyFormat(wsSum, 4, sumAoa.length - 1, [3, 4, 5, 6, 7, 8, 9, 10]);
  XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');

  // ── Loan Issue ────────────────────────────────────────────
  const issueAoa: (string | number)[][] = [
    [`LOAN GRANTED REPORT — ${fy.label} (${fmtD(fy.start)} to ${fmtD(fy.end)})`],
    [src],
    [],
    ['No', 'Loan Ref', 'Member No', 'Client Name', 'Center', 'Loan Type', 'Issue Date',
     'Capital (LKR)', 'Interest (LKR)', 'Total (LKR)', 'Weekly Pmt', 'Cycle', 'New/Repeat',
     'Status', 'Collected to FY End', 'Due at FY End'],
    ...issued.map((l, i) => {
      const tot = loanTotal(l);
      const paid = Math.min(cumPaid[l.id] ?? 0, tot);
      return [
        i + 1, loanRef(l.member_no, l.cycle_no), l.member_no, l.client, l.center,
        `${l.is_first_loan ? 'NEW' : 'RE'}-${Math.round((l.principal ?? 0) / 1000)}K`,
        fmtD(l.issued_date), round2(l.principal ?? 0), round2(l.interest ?? 0), round2(tot),
        round2(l.weekly_payment ?? 0), l.cycle_no ?? 1,
        l.is_first_loan ? 'NEW' : 'REPEAT', (l.status ?? '').toUpperCase(),
        round2(paid), round2(tot - paid),
      ];
    }),
    ['', 'TOTAL', '', '', '', '', '',
     round2(totals.grantedCapital), round2(totals.grantedInterest),
     round2(totals.grantedCapital + totals.grantedInterest), '', '', '', '',
     round2(issued.reduce((s, l) => s + Math.min(cumPaid[l.id] ?? 0, loanTotal(l)), 0)),
     round2(issued.reduce((s, l) => s + loanTotal(l) - Math.min(cumPaid[l.id] ?? 0, loanTotal(l)), 0))],
  ];
  const wsIssue = XLSX.utils.aoa_to_sheet(issueAoa);
  wsIssue['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 11 }, { wch: 26 }, { wch: 22 },
    { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 11 },
    { wch: 6 }, { wch: 10 }, { wch: 11 }, { wch: 15 }, { wch: 14 }];
  moneyFormat(wsIssue, 4, issueAoa.length - 1, [7, 8, 9, 10, 14, 15]);
  XLSX.utils.book_append_sheet(wb, wsIssue, 'Loan Issue');

  // ── Collections ───────────────────────────────────────────
  const collAoa: (string | number)[][] = [
    [`LOAN COLLECTION REPORT — ${fy.label} (${fmtD(fy.start)} to ${fmtD(fy.end)})`],
    [src + ' Split: Interest = Amount x LoanInterest/LoanTotal (proportional); Capital = Amount - Interest. N/P = visited, nothing paid.'],
    [],
    ['No', 'Date', 'Loan Ref', 'Member No', 'Client Name', 'Center', 'Amount Paid',
     'Capital (LKR)', 'Interest (LKR)', 'Loan Capital', 'Loan Interest', 'Loan Total',
     'N/P', 'Shortfall'],
  ];
  let collCap = 0;
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    const l = loanById.get(p.loan_id);
    if (!l) continue;
    const amt = p.amt ?? 0;
    const int = splitInterest(amt, l);
    collCap += amt - int;
    collAoa.push([
      i + 1, fmtD(p.d), loanRef(l.member_no, l.cycle_no), l.member_no, l.client, l.center,
      round2(amt), round2(amt - int), round2(int),
      round2(l.principal ?? 0), round2(l.interest ?? 0), round2(loanTotal(l)),
      p.np ? 'N/P' : '', round2(p.sf ?? 0),
    ]);
  }
  collAoa.push(['', 'TOTAL', '', '', '', '',
    round2(totals.collectedAmount), round2(collCap), round2(totals.collectedInterest),
    '', '', '', '', round2(payments.reduce((s, p) => s + (p.sf ?? 0), 0))]);
  const wsColl = XLSX.utils.aoa_to_sheet(collAoa);
  wsColl['!cols'] = [{ wch: 6 }, { wch: 11 }, { wch: 14 }, { wch: 11 }, { wch: 26 },
    { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 6 }, { wch: 11 }];
  moneyFormat(wsColl, 4, collAoa.length - 1, [6, 7, 8, 9, 10, 11, 13]);
  XLSX.utils.book_append_sheet(wb, wsColl, 'Collections');

  // ── Outstanding ───────────────────────────────────────────
  const outAoa: (string | number)[][] = [
    [`CAPITAL & INTEREST OUTSTANDING — as at ${fmtD(fy.end)}`],
    [src + ' All loans issued on or before FY end with a balance remaining; collected amounts split proportionally.'],
    [],
    ['No', 'Loan Ref', 'Member No', 'Client Name', 'Center', 'Issue Date',
     'Capital (LKR)', 'Interest (LKR)', 'Total (LKR)', 'Collected to Date',
     'Collected Capital', 'Collected Interest', 'O/S Capital', 'O/S Interest', 'O/S Total'],
  ];
  for (let i = 0; i < outstanding.length; i++) {
    const l = outstanding[i];
    const tot = loanTotal(l);
    const paid = Math.min(cumPaid[l.id] ?? 0, tot);
    const colCap = Math.round(paid * ((l.principal ?? 0) / tot) * 100) / 100;
    const oc = (l.principal ?? 0) - colCap;
    const oi = (l.interest ?? 0) - (paid - colCap);
    outAoa.push([
      i + 1, loanRef(l.member_no, l.cycle_no), l.member_no, l.client, l.center,
      fmtD(l.issued_date), round2(l.principal ?? 0), round2(l.interest ?? 0), round2(tot),
      round2(paid), round2(colCap), round2(paid - colCap),
      round2(oc), round2(oi), round2(oc + oi),
    ]);
  }
  outAoa.push(['', 'TOTAL', '', '', '', '', '', '', '', '', '', '',
    round2(totals.osCapital), round2(totals.osInterest),
    round2(totals.osCapital + totals.osInterest)]);
  const wsOut = XLSX.utils.aoa_to_sheet(outAoa);
  wsOut['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 11 }, { wch: 26 }, { wch: 22 },
    { wch: 11 }, ...Array(9).fill({ wch: 14 })];
  moneyFormat(wsOut, 4, outAoa.length - 1, [6, 7, 8, 9, 10, 11, 12, 13, 14]);
  XLSX.utils.book_append_sheet(wb, wsOut, 'Outstanding');

  // ── Notes ─────────────────────────────────────────────────
  const notesAoa: string[][] = [
    [`NOTES & METHODOLOGY — ${fy.label}`],
    [src],
    [],
    ['1. SOURCE: live production database of the DIRIYALANKA loan management system at the moment of generation.'],
    ['2. CAPITAL/INTEREST SPLIT: proportional allocation — interest portion = amount x (loan interest / loan total); capital = amount - interest. Constant proportion over the loan life (flat-rate products).'],
    ['3. N/P ROWS: field visits where the member paid nothing are retained as zero-amount rows to preserve the visit trail.'],
    ['4. "Collected to FY End" uses the complete payment history including years before this FY.'],
    ['5. OUTSTANDING lists every loan issued on or before FY end not fully collected by FY end, including loans from earlier years.'],
    [`6. COVERAGE: loans issued in FY: ${totals.loansIssued.toLocaleString()}; collection rows: ${totals.collectionRows.toLocaleString()}; open positions at FY end: ${totals.openPositions.toLocaleString()}.`],
    ['7. Figures are computed values. The reference offline workbooks prepared for the audit team (Jul 2026) contain the same figures with live formulas.'],
    ['8. LOAN REF: member number + cycle letter (A = 1st loan, B = 2nd, C = 3rd, ...). Example: DLG0005B is the second loan of member DLG0005.'],
  ];
  const wsNotes = XLSX.utils.aoa_to_sheet(notesAoa);
  wsNotes['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wsNotes, 'Notes');

  onProgress({ stage: 'Done', pct: 100 });
  return { totals, workbook: wb };
}

export function downloadAuditWorkbook(wb: XLSX.WorkBook, fyLabel: string) {
  XLSX.writeFile(wb, `DIRIYALANKA-Audit-${fyLabel}.xlsx`, { compression: true });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtD(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Apply LKR number format to given 0-based columns across a row range. */
function moneyFormat(ws: XLSX.WorkSheet, startRow: number, endRow: number, cols: number[]) {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of cols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && cell.t === 'n') cell.z = '#,##0.00';
    }
  }
}
