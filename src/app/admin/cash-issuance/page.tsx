'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Banknote, Save, Calendar, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  setStaffCashIssuedAction,
  getStaffCashIssuedForDateAction,
  type StaffCashIssuedRow,
} from '@/app/actions/cash-issuance';
import { formatCurrency, formatDate, getTodayString } from '@/lib/utils';

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-rose-500',
];

export default function CashIssuancePage() {
  const [date, setDate] = useState<string>(getTodayString());
  const [rows, setRows] = useState<StaffCashIssuedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Load on mount + whenever date changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStaffCashIssuedForDateAction(date).then((res) => {
      if (cancelled) return;
      if ('error' in res) {
        toast.error(res.error);
        setRows([]);
      } else {
        setRows(res.data);
        // Seed drafts with current values so the input shows the saved amount
        const seeded: Record<string, string> = {};
        for (const r of res.data) seeded[r.staff_id] = String(r.cash_issued ?? 0);
        setDrafts(seeded);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const totals = useMemo(() => {
    const totalStaff = rows.length;
    const totalCash = rows.reduce((sum, r) => sum + (Number(r.cash_issued) || 0), 0);
    const pending = rows.filter((r) => !r.has_submitted_report).length;
    return { totalStaff, totalCash, pending };
  }, [rows]);

  const handleSave = async (staffId: string) => {
    const raw = drafts[staffId] ?? '0';
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid non-negative amount.');
      return;
    }

    setSavingId(staffId);

    // Optimistic UI update — flip the local row immediately so the large
    // LKR display reflects the new amount before the server round-trip lands.
    const prevRows = rows;
    setRows((curr) =>
      curr.map((r) =>
        r.staff_id === staffId
          ? { ...r, cash_issued: amount, last_updated: new Date().toISOString() }
          : r,
      ),
    );

    const res = await setStaffCashIssuedAction(staffId, date, amount);

    if ('error' in res) {
      // Roll back the optimistic update
      setRows(prevRows);
      toast.error(res.error);
      setSavingId(null);
      return;
    }

    toast.success('Cash issued saved.');

    // Refresh from server to pull authoritative last_updated + has_submitted_report
    const refreshed = await getStaffCashIssuedForDateAction(date);
    if (!('error' in refreshed)) {
      setRows(refreshed.data);
    }
    setSavingId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <p className="text-blue-200 text-sm font-medium mb-1">Cash Flow</p>
        <h1 className="text-2xl md:text-3xl font-bold">Cash Issuance</h1>
        <p className="text-blue-100/90 text-sm mt-1">
          Daily cash given to staff for collections
        </p>

        {/* Top summary stats */}
        <div className="mt-5 grid grid-cols-3 gap-3 max-w-2xl">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Total Staff</p>
            <p className="text-xl md:text-2xl font-bold mt-0.5">
              {loading ? '—' : totals.totalStaff}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Cash Issued</p>
            <p className="text-base md:text-xl font-bold mt-0.5 truncate">
              {loading ? '—' : formatCurrency(totals.totalCash)}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Pending</p>
            <p className="text-xl md:text-2xl font-bold mt-0.5">
              {loading ? '—' : totals.pending}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">
        {/* Date picker */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
            <div className="flex-1 max-w-xs">
              <Label
                htmlFor="cash-date"
                className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1.5"
              >
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Report Date
              </Label>
              <Input
                id="cash-date"
                type="date"
                value={date}
                max={getTodayString()}
                onChange={(e) => setDate(e.target.value)}
                className="h-10"
              />
            </div>
            <p className="text-xs text-muted-foreground sm:pb-3">
              Showing cash issuance for{' '}
              <span className="font-medium text-gray-900">{formatDate(date)}</span>. Pick a
              past date to correct historical entries.
            </p>
          </div>
        </div>

        {/* Staff list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No staff members found</p>
            <p className="text-sm mt-1">Add staff accounts to assign cash issuance.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rows.map((row, i) => {
              const draftValue = drafts[row.staff_id] ?? '0';
              const draftNum = Number(draftValue);
              const dirty =
                Number.isFinite(draftNum) && draftNum !== Number(row.cash_issued);
              const isSaving = savingId === row.staff_id;

              return (
                <div
                  key={row.staff_id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 hover:shadow-md transition-all"
                >
                  {/* Top row: avatar + identity + status */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl ${
                          AVATAR_COLORS[i % AVATAR_COLORS.length]
                        } flex items-center justify-center text-white font-bold text-lg shrink-0`}
                      >
                        {row.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {row.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.email}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full whitespace-nowrap shrink-0 ${
                        row.has_submitted_report
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          row.has_submitted_report ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                      {row.has_submitted_report ? 'Report submitted' : 'Pending'}
                    </span>
                  </div>

                  {/* Current amount display */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 mb-4 border border-blue-100">
                    <div className="flex items-center gap-2 text-xs text-blue-700 mb-1">
                      <Banknote className="h-3.5 w-3.5" />
                      <span className="font-medium">Currently Issued</span>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold text-blue-900 tracking-tight">
                      {formatCurrency(Number(row.cash_issued) || 0)}
                    </p>
                    {row.last_updated && (
                      <p className="text-[11px] text-blue-700/70 mt-1">
                        Last updated{' '}
                        {new Date(row.last_updated).toLocaleString('en-LK', {
                          timeZone: 'Asia/Colombo',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    )}
                  </div>

                  {/* Inline edit */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label
                        htmlFor={`amount-${row.staff_id}`}
                        className="text-xs font-medium text-gray-700 mb-1.5"
                      >
                        Set new amount (LKR)
                      </Label>
                      <Input
                        id={`amount-${row.staff_id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="100"
                        value={draftValue}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.staff_id]: e.target.value,
                          }))
                        }
                        disabled={isSaving}
                        className="h-10"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleSave(row.staff_id)}
                      disabled={isSaving || !dirty}
                      className="h-10 gap-1.5 whitespace-nowrap"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
