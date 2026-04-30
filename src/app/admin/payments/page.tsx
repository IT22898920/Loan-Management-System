'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { MapPin, AlertTriangle, CheckCircle2, CreditCard, Search, Download, FileText, X, Loader2, Filter } from 'lucide-react';
import { formatCurrency, formatDate, getTodayString } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { buildGoogleMapsUrl } from '@/lib/gps';
import { generatePaymentsPDF, PaymentPDFRow } from '@/lib/pdf-report';

interface PaymentRow {
  id: string;
  payment_date: string;
  amount_paid: number;
  is_not_paid: boolean;
  shortfall: number;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_address: string | null;
  created_at: string;
  member: { full_name: string; member_number: string; center: { id: string; name: string; center_number: number } | null } | null;
  loan: { loan_plan: number } | null;
  staff: { full_name: string } | null;
}

type StatusFilter = 'all' | 'paid' | 'np' | 'shortfall';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [centerFilter, setCenterFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('payments')
      .select(`id, payment_date, amount_paid, is_not_paid, shortfall, gps_lat, gps_lng, gps_address, created_at, member:members(full_name, member_number, center:centers(id, name, center_number)), loan:loans(loan_plan), staff:profiles(full_name)`)
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load payments.');
        setPayments((data ?? []) as unknown as PaymentRow[]);
        setLoading(false);
      });
  }, []);

  // Unique centers from payments data
  const centerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; center_number: number }>();
    for (const p of payments) {
      const c = p.member?.center;
      if (c && !map.has(c.id)) map.set(c.id, c);
    }
    return [...map.values()].sort((a, b) => a.center_number - b.center_number);
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return payments.filter((p) => {
      const memberName = p.member?.full_name?.toLowerCase() ?? '';
      const memberNum = p.member?.member_number?.toLowerCase() ?? '';
      const staffName = p.staff?.full_name?.toLowerCase() ?? '';

      const matchesSearch = !q || memberName.includes(q) || memberNum.includes(q) || staffName.includes(q);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'paid' && !p.is_not_paid && p.shortfall === 0) ||
        (statusFilter === 'np' && p.is_not_paid) ||
        (statusFilter === 'shortfall' && !p.is_not_paid && p.shortfall > 0);
      const matchesCenter = !centerFilter || p.member?.center?.id === centerFilter;
      const matchesFrom = !dateFrom || p.payment_date >= dateFrom;
      const matchesTo = !dateTo || p.payment_date <= dateTo;

      return matchesSearch && matchesStatus && matchesCenter && matchesFrom && matchesTo;
    });
  }, [payments, search, statusFilter, centerFilter, dateFrom, dateTo]);

  // Computed stats for filtered data
  const totalCollected = filtered.reduce((s, p) => s + (p.is_not_paid ? 0 : p.amount_paid), 0);
  const paidCount = filtered.filter(p => !p.is_not_paid && p.shortfall === 0).length;
  const npCount = filtered.filter(p => p.is_not_paid).length;
  const shortfallCount = filtered.filter(p => !p.is_not_paid && p.shortfall > 0).length;

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setCenterFilter('');
    setDateFrom('');
    setDateTo('');
  }

  const hasFilters = search || statusFilter !== 'all' || centerFilter || dateFrom || dateTo;

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const q = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'Date',
      'Member Name',
      'Member #',
      'Loan Plan (LKR)',
      'Status',
      'Amount Paid (LKR)',
      'Shortfall (LKR)',
      'Staff Name',
      'GPS Address',
      'GPS Lat',
      'GPS Lng',
    ];

    const rows = filtered.map((p) => {
      const status = p.is_not_paid ? 'Not Paid' : p.shortfall > 0 ? 'Shortfall' : 'Paid';
      return [
        p.payment_date,
        q(p.member?.full_name ?? ''),
        p.member?.member_number ?? '',
        p.loan?.loan_plan ?? '',          // plain number — no comma → no column shift
        status,
        p.is_not_paid ? 0 : p.amount_paid,
        p.shortfall ?? 0,
        q(p.staff?.full_name ?? ''),
        q(p.gps_address ?? ''),
        p.gps_lat ?? '',
        p.gps_lng ?? '',
      ];
    });

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${getTodayString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── PDF Export ────────────────────────────────────────────────────────────
  function exportPDF() {
    const rows: PaymentPDFRow[] = filtered.map((p) => ({
      payment_date: p.payment_date,
      member_name: p.member?.full_name ?? '—',
      member_number: p.member?.member_number ?? '—',
      loan_plan: p.loan?.loan_plan === 5000 ? '5K' : p.loan?.loan_plan === 10000 ? '10K' : '20K',
      amount_paid: p.amount_paid,
      is_not_paid: p.is_not_paid,
      shortfall: p.shortfall,
      staff_name: p.staff?.full_name ?? '—',
    }));
    const dateRange = dateFrom || dateTo ? `${dateFrom || 'all'} to ${dateTo || 'all'}` : undefined;
    generatePaymentsPDF(rows, dateRange ? `Payments Report (${dateRange})` : 'All Payments Report');
  }

  const planLabel = (plan: number | undefined) =>
    plan === 5000 ? '5K' : plan === 10000 ? '10K' : '20K';

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <p className="text-blue-200 text-sm font-medium mb-1">Overview</p>
        <h1 className="text-2xl md:text-3xl font-bold">All Payments</h1>
        <p className="text-blue-200 text-sm mt-1">Full payment history with GPS tracking</p>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
            <p className="text-blue-200 text-xs font-medium">Total Collected</p>
            <p className="text-xl md:text-2xl font-bold mt-1">{loading ? '—' : formatCurrency(totalCollected)}</p>
            <p className="text-blue-200 text-xs mt-1">{filtered.length} records shown</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
            <p className="text-blue-200 text-xs font-medium">Paid in Full</p>
            <p className="text-xl md:text-2xl font-bold mt-1 text-green-300">{loading ? '—' : paidCount}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
            <p className="text-blue-200 text-xs font-medium">Not Paid (N/P)</p>
            <p className="text-xl md:text-2xl font-bold mt-1 text-red-300">{loading ? '—' : npCount}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
            <p className="text-blue-200 text-xs font-medium">Shortfalls</p>
            <p className="text-xl md:text-2xl font-bold mt-1 text-yellow-300">{loading ? '—' : shortfallCount}</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-4">
        {/* Toolbar row 1 — search + exports */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search member name, #, or staff…"
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
          <button onClick={exportCSV} disabled={filtered.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium shadow-sm hover:bg-gray-50 disabled:opacity-40 transition-all whitespace-nowrap">
            <Download className="h-4 w-4" /> CSV
          </button>
          <button onClick={exportPDF} disabled={filtered.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium shadow-sm hover:bg-gray-50 disabled:opacity-40 transition-all whitespace-nowrap">
            <FileText className="h-4 w-4" /> PDF
          </button>
        </div>

        {/* Toolbar row 2 — filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Status pills */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            {(['all', 'paid', 'np', 'shortfall'] as StatusFilter[]).map((v) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === v ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v === 'all' ? 'All' : v === 'paid' ? 'Paid' : v === 'np' ? 'N/P' : 'Shortfall'}
              </button>
            ))}
          </div>

          {/* Center filter */}
          <select
            value={centerFilter}
            onChange={(e) => setCenterFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">All Centers</option>
            {centerOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name} (#{c.center_number})</option>
            ))}
          </select>

          {/* Date range */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs text-gray-700 bg-transparent focus:outline-none"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs text-gray-700 bg-transparent focus:outline-none"
            />
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-all">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}

          {hasFilters && (
            <span className="text-sm text-muted-foreground ml-auto">
              <span className="font-semibold text-gray-900">{filtered.length}</span> of {payments.length} payments
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
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{payments.length === 0 ? 'No payments recorded yet' : 'No results match your filters'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Member</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Plan</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Amount</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Staff</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Address</th>
                    <th className="text-left px-5 py-3.5 font-medium text-gray-500 text-xs uppercase tracking-wider">Map</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.payment_date)}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-900">{p.member?.full_name}</p>
                        <p className="text-xs text-muted-foreground">#{p.member?.member_number}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600">
                          {planLabel(p.loan?.loan_plan)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {p.is_not_paid ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">N/P</span>
                        ) : (
                          <span className={`font-semibold text-sm ${p.shortfall > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                            {formatCurrency(p.amount_paid)}
                            {p.shortfall > 0 && <span className="text-red-500 text-xs ml-1">(-{formatCurrency(p.shortfall)})</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {p.is_not_paid ? (
                          <span className="flex items-center gap-1 text-red-500 text-xs"><AlertTriangle className="h-3 w-3" /> Not Paid</span>
                        ) : p.shortfall > 0 ? (
                          <span className="flex items-center gap-1 text-yellow-600 text-xs"><AlertTriangle className="h-3 w-3" /> Shortfall</span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-3 w-3" /> Paid</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{p.staff?.full_name}</td>
                      <td className="px-5 py-3.5 max-w-[220px]">
                        {p.gps_address ? (
                          <span className="text-xs text-gray-600 leading-snug line-clamp-2" title={p.gps_address}>
                            {p.gps_address}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {p.gps_lat && p.gps_lng ? (
                          <a href={buildGoogleMapsUrl(p.gps_lat, p.gps_lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary text-xs hover:underline">
                            <MapPin className="h-3 w-3" /> Map
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
