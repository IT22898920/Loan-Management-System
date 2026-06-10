'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { FileText, CheckCircle2, Clock, Search, X, Download, Loader2, Filter, RefreshCw, Eye, Banknote } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { generateDailyReportPDF, ReportCenter } from '@/lib/pdf-report';

interface ReportRow {
  id: string;
  report_date: string;
  cash_issued: number;
  loan_issued: number;
  submitted_at: string | null;
  staff_id: string;
  staff: { full_name: string; email: string } | null;
}

// Monday of the week containing dateStr ('YYYY-MM-DD'), computed entirely in
// UTC so it never drifts a day based on the host timezone.
function weekStartMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - daysFromMon);
  return d.toISOString().split('T')[0];
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'pending'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [viewingReport, setViewingReport] = useState<ReportRow | null>(null);
  const [viewCenters, setViewCenters] = useState<ReportCenter[]>([]);
  const [viewIssuedLoans, setViewIssuedLoans] = useState<{ id: string; principal: number | null; member: { full_name: string; member_number: string; center: { name: string; center_number: number } | null } | null }[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const loadReports = () => {
    setLoading(true);
    const supabase = createClient();
    supabase
      .from('daily_reports')
      .select(`id, report_date, cash_issued, loan_issued, submitted_at, staff_id, staff:profiles(full_name, email)`)
      .order('report_date', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load reports.');
        setReports((data ?? []) as unknown as ReportRow[]);
        setLoading(false);
      });
  };

  useEffect(() => { loadReports(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return reports.filter((r) => {
      const staffName = r.staff?.full_name?.toLowerCase() ?? '';
      const staffEmail = r.staff?.email?.toLowerCase() ?? '';
      const matchesSearch = !q || staffName.includes(q) || staffEmail.includes(q) || r.report_date.includes(q);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'submitted' && !!r.submitted_at) ||
        (statusFilter === 'pending' && !r.submitted_at);
      const matchesFrom = !dateFrom || r.report_date >= dateFrom;
      const matchesTo = !dateTo || r.report_date <= dateTo;
      return matchesSearch && matchesStatus && matchesFrom && matchesTo;
    });
  }, [reports, search, statusFilter, dateFrom, dateTo]);

  const submittedCount = filtered.filter(r => r.submitted_at).length;
  const pendingCount = filtered.filter(r => !r.submitted_at).length;

  const hasFilters = search || statusFilter !== 'all' || dateFrom || dateTo;

  // ── Download PDF for a specific report ───────────────────────────────────
  async function handleDownloadPDF(report: ReportRow) {
    setDownloadingId(report.id);
    try {
      const supabase = createClient();

      // Get all payments by this staff on this date, with loan + member + center info
      const { data: payments } = await supabase
        .from('payments')
        .select('loan_id, amount_paid, is_not_paid, loan:loans!inner(id, weekly_payment, member:members!inner(center_id, center:centers(id, name, center_number)))')
        .eq('staff_id', report.staff_id)
        .eq('payment_date', report.report_date);

      // Get today's issued loans per center
      const { data: issuedLoans } = await supabase
        .from('loans')
        .select('principal, member:members!inner(center_id)')
        .eq('created_by', report.staff_id)
        .eq('issued_date', report.report_date);

      // Build per-center map from payments
      type CenterData = { id: string; name: string; center_number: number; collected: number; loan_issued: number };
      const centerMap = new Map<string, CenterData>();

      for (const p of (payments ?? []) as unknown as {
        loan_id: string; amount_paid: number; is_not_paid: boolean;
        loan: { weekly_payment: number; member: { center_id: string; center: { id: string; name: string; center_number: number } } };
      }[]) {
        const c = p.loan.member.center;
        if (!centerMap.has(c.id)) centerMap.set(c.id, { id: c.id, name: c.name, center_number: c.center_number, collected: 0, loan_issued: 0 });
        if (!p.is_not_paid) centerMap.get(c.id)!.collected += p.amount_paid;
      }

      for (const l of (issuedLoans ?? []) as unknown as { principal: number | null; member: { center_id: string } }[]) {
        const existing = [...centerMap.values()].find(c => c.id === l.member.center_id);
        if (existing) existing.loan_issued += (l.principal ?? 0);
      }

      // Get expected collection per center (active loans on that date)
      const centers: ReportCenter[] = [];
      for (const cd of centerMap.values()) {
        const { data: activeLoans } = await supabase
          .from('loans')
          .select('weekly_payment, issued_date, member:members!inner(center_id)')
          .eq('members.center_id', cd.id)
          .lte('issued_date', report.report_date)
          .eq('status', 'active');

        // Expected = active loans issued before the current collection week
        const weekStartStr = weekStartMonday(report.report_date);

        const expectedCollection = (activeLoans ?? [])
          .filter((l: { issued_date: string }) => l.issued_date < weekStartStr)
          .reduce((s: number, l: { weekly_payment: number }) => s + l.weekly_payment, 0);

        centers.push({
          center_name: cd.name,
          center_number: cd.center_number,
          expected_collection: expectedCollection,
          collection_amount: cd.collected,
          loan_issued: cd.loan_issued,
        });
      }

      generateDailyReportPDF({
        staff_name: report.staff?.full_name ?? 'Unknown',
        report_date: report.report_date,
        centers,
        cash_issued: report.cash_issued,
        loan_issued: report.loan_issued,
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF.');
    } finally {
      setDownloadingId(null);
    }
  }

  // ── View report in modal ──────────────────────────────────────────────────
  async function handleViewReport(report: ReportRow) {
    setViewingReport(report);
    setViewCenters([]);
    setViewIssuedLoans([]);
    setViewLoading(true);
    try {
      const supabase = createClient();
      const { data: payments } = await supabase
        .from('payments')
        .select('loan_id, amount_paid, is_not_paid, loan:loans!inner(id, weekly_payment, member:members!inner(center_id, center:centers(id, name, center_number)))')
        .eq('staff_id', report.staff_id)
        .eq('payment_date', report.report_date);

      const [{ data: issuedLoans }, { data: issuedLoansDetail }] = await Promise.all([
        supabase
          .from('loans')
          .select('principal, member:members!inner(center_id)')
          .eq('created_by', report.staff_id)
          .eq('issued_date', report.report_date),
        supabase
          .from('loans')
          .select('id, principal, member:members!inner(full_name, member_number, center:centers(name, center_number))')
          .eq('created_by', report.staff_id)
          .eq('issued_date', report.report_date),
      ]);
      setViewIssuedLoans((issuedLoansDetail ?? []) as unknown as typeof viewIssuedLoans);

      type CenterData = { id: string; name: string; center_number: number; collected: number; loan_issued: number };
      const centerMap = new Map<string, CenterData>();

      for (const p of (payments ?? []) as unknown as {
        amount_paid: number; is_not_paid: boolean;
        loan: { weekly_payment: number; member: { center_id: string; center: { id: string; name: string; center_number: number } } };
      }[]) {
        const c = p.loan.member.center;
        if (!centerMap.has(c.id)) centerMap.set(c.id, { id: c.id, name: c.name, center_number: c.center_number, collected: 0, loan_issued: 0 });
        if (!p.is_not_paid) centerMap.get(c.id)!.collected += p.amount_paid;
      }

      for (const l of (issuedLoans ?? []) as unknown as { principal: number | null; member: { center_id: string } }[]) {
        const existing = [...centerMap.values()].find((c) => c.id === l.member.center_id);
        if (existing) existing.loan_issued += (l.principal ?? 0);
      }

      const weekStartStr = weekStartMonday(report.report_date);

      const built: ReportCenter[] = [];
      for (const cd of centerMap.values()) {
        const { data: activeLoans } = await supabase
          .from('loans')
          .select('weekly_payment, issued_date, member:members!inner(center_id)')
          .eq('members.center_id', cd.id)
          .lte('issued_date', report.report_date)
          .eq('status', 'active');
        const expectedCollection = (activeLoans ?? [])
          .filter((l: { issued_date: string }) => l.issued_date < weekStartStr)
          .reduce((s: number, l: { weekly_payment: number }) => s + l.weekly_payment, 0);
        built.push({ center_name: cd.name, center_number: cd.center_number, expected_collection: expectedCollection, collection_amount: cd.collected, loan_issued: cd.loan_issued });
      }
      setViewCenters(built);
    } finally {
      setViewLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <p className="text-blue-200 text-sm font-medium mb-1">Overview</p>
        <h1 className="text-2xl md:text-3xl font-bold">Daily Reports</h1>
        <p className="text-blue-200 text-sm mt-1">Staff-submitted daily collection reports</p>

        <div className="mt-5 grid grid-cols-3 gap-3 max-w-xs">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Showing</p>
            <p className="text-xl font-bold mt-0.5">{loading ? '—' : filtered.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Submitted</p>
            <p className="text-xl font-bold mt-0.5 text-green-300">{loading ? '—' : submittedCount}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Pending</p>
            <p className="text-xl font-bold mt-0.5 text-yellow-300">{loading ? '—' : pendingCount}</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <button
            onClick={loadReports}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-2 rounded-xl hover:bg-primary/20 transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by staff name or date…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status pills */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            {(['all', 'submitted', 'pending'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                  statusFilter === v ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-xs text-gray-700 bg-transparent focus:outline-none" />
            <span className="text-muted-foreground text-xs">to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-xs text-gray-700 bg-transparent focus:outline-none" />
          </div>
          {hasFilters && (
            <button onClick={() => { setSearch(''); setStatusFilter('all'); setDateFrom(''); setDateTo(''); }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gray-700 px-2 py-2 rounded-lg hover:bg-gray-100 transition-all">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
          {hasFilters && (
            <span className="text-sm text-muted-foreground ml-auto">
              <span className="font-semibold text-gray-900">{filtered.length}</span> of {reports.length} reports
            </span>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{reports.length === 0 ? 'No reports submitted yet' : 'No results match your filters'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Staff</th>
                    <th className="text-right px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Cash Issued</th>
                    <th className="text-right px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Loan Issued</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-gray-900 whitespace-nowrap">{formatDate(r.report_date)}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{r.staff?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{r.staff?.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{formatCurrency(r.cash_issued)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{formatCurrency(r.loan_issued)}</td>
                      <td className="px-5 py-3.5">
                        {r.submitted_at ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-green-50 text-green-700 text-xs font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Submitted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewReport(r)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(r)}
                            disabled={downloadingId === r.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 hover:bg-primary/10 text-primary text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {downloadingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            {downloadingId === r.id ? 'Generating…' : 'Download'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setViewingReport(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-6 py-5 rounded-t-2xl flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Daily Report</h2>
                <p className="text-blue-200 text-sm mt-0.5">{viewingReport.staff?.full_name} · {formatDate(viewingReport.report_date)}</p>
              </div>
              <button onClick={() => setViewingReport(null)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {viewLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <>
                  {/* Collection table */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Collection Summary</p>
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Center</th>
                            <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500">#</th>
                            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Expected</th>
                            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Collected</th>
                            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Loan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {viewCenters.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">No collection data</td></tr>
                          ) : viewCenters.map((c, i) => (
                            <tr key={i} className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 font-medium text-gray-800">{c.center_name}</td>
                              <td className="px-3 py-3 text-center text-muted-foreground">{c.center_number}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(c.expected_collection)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(c.collection_amount)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-blue-700">{c.loan_issued > 0 ? formatCurrency(c.loan_issued) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        {viewCenters.length > 0 && (
                          <tfoot>
                            <tr className="bg-blue-50 border-t-2 border-blue-100">
                              <td className="px-4 py-3 font-bold text-primary" colSpan={2}>TOTAL</td>
                              <td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(viewCenters.reduce((s,c)=>s+c.expected_collection,0))}</td>
                              <td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(viewCenters.reduce((s,c)=>s+c.collection_amount,0))}</td>
                              <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(viewCenters.reduce((s,c)=>s+c.loan_issued,0))}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* Loans Issued Breakdown */}
                  {viewIssuedLoans.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Banknote className="h-3.5 w-3.5" /> Loans Issued ({viewIssuedLoans.length})
                      </p>
                      <div className="rounded-xl border border-blue-100 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-blue-50 border-b border-blue-100">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-medium text-blue-600">Member</th>
                              <th className="text-left px-3 py-2.5 text-xs font-medium text-blue-600">Center</th>
                              <th className="text-right px-4 py-2.5 text-xs font-medium text-blue-600">Plan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-50">
                            {viewIssuedLoans.map((loan) => (
                              <tr key={loan.id} className="hover:bg-blue-50/40">
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-gray-900 text-sm">{loan.member?.full_name}</p>
                                  <p className="text-xs text-muted-foreground">#{loan.member?.member_number}</p>
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-600">
                                  {loan.member?.center?.name}
                                  <span className="text-xs text-gray-400 ml-1">#{loan.member?.center?.center_number}</span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-100 text-blue-700">
                                    {formatCurrency(loan.principal ?? 0)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-blue-50 border-t-2 border-blue-100">
                              <td className="px-4 py-2.5 font-bold text-blue-700 text-xs" colSpan={2}>TOTAL LOAN ISSUED</td>
                              <td className="px-4 py-2.5 text-right font-bold text-blue-700">
                                {formatCurrency(viewIssuedLoans.reduce((s, l) => s + (l.principal ?? 0), 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Cash flow */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cash Flow</p>
                    {(() => {
                      const totalCollected = viewCenters.reduce((s,c)=>s+c.collection_amount,0);
                      const balance = viewingReport.cash_issued + totalCollected - viewingReport.loan_issued;
                      return (
                        <>
                          <div className="flex justify-between text-sm"><span className="text-gray-500">Cash Issued (Starting)</span><span className="font-medium text-green-700">+ {formatCurrency(viewingReport.cash_issued)}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-gray-500">Loan Repayments</span><span className="font-medium text-green-700">+ {formatCurrency(totalCollected)}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-gray-500">Loan Issued</span><span className="font-medium text-red-600">− {formatCurrency(viewingReport.loan_issued)}</span></div>
                          <div className="flex justify-between pt-2 border-t border-gray-200">
                            <span className="font-bold text-gray-900">Total Cash Balance</span>
                            <span className={`font-black text-lg ${balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(balance)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Download button */}
                  <button
                    onClick={() => handleDownloadPDF(viewingReport)}
                    disabled={downloadingId === viewingReport.id}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3 font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {downloadingId === viewingReport.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {downloadingId === viewingReport.id ? 'Generating…' : 'Download PDF'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
