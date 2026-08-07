'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, MapPin, ArrowLeft, AlertTriangle, CheckCircle2, Banknote, CircleDollarSign, User } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { captureLocation } from '@/lib/gps';
import { recordPaymentAction } from '@/app/actions/payments';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';

function PaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const loanId = searchParams.get('loanId') ?? '';
  const memberId = searchParams.get('memberId') ?? '';
  const weekly = parseFloat(searchParams.get('weekly') ?? '0');
  const balance = parseFloat(searchParams.get('balance') ?? '0');
  const principal = parseFloat(searchParams.get('principal') ?? '0');
  const prevShortfall = parseFloat(searchParams.get('prevShortfall') ?? '0');

  const [amount, setAmount] = useState(weekly.toString());
  const [isNotPaid, setIsNotPaid] = useState(false);
  const [isSettlement, setIsSettlement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Live remaining balance from DB — the URL param goes stale if today's weekly
  // payment was already recorded before this page was opened again.
  const [liveBalance, setLiveBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!loanId) return;
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('loans')
        .select('loan_balance')
        .eq('id', loanId)
        .maybeSingle();
      if (!alive || !data) return;
      setLiveBalance(Number(data.loan_balance));
    })();
    return () => { alive = false; };
  }, [loanId]);

  const remainingBalance = liveBalance ?? balance;

  // Settlement locks the amount to the remaining balance (also re-syncs if the
  // live balance arrives after the toggle was switched on).
  useEffect(() => {
    if (isSettlement) setAmount(remainingBalance.toString());
  }, [isSettlement, remainingBalance]);

  // ?settle=1 (from the center page's "Settle" shortcut on already-collected
  // members) arms settlement mode once the live balance confirms there is
  // still something to settle.
  const wantsAutoSettle = searchParams.get('settle') === '1';
  useEffect(() => {
    if (wantsAutoSettle && liveBalance !== null && liveBalance > 0) {
      setIsNotPaid(false);
      setIsSettlement(true);
    }
  }, [wantsAutoSettle, liveBalance]);

  // Member identity loaded from DB (prevents same-day cross-center misclicks
  // where the URL params might point at the wrong loan).
  const [memberInfo, setMemberInfo] = useState<{
    full_name: string;
    member_number: string;
    center_name: string | null;
  } | null>(null);

  useEffect(() => {
    if (!memberId) return;
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('members')
        .select('full_name, member_number, center:centers(name)')
        .eq('id', memberId)
        .single();
      if (!alive || !data) return;
      const center = data.center as unknown as { name: string } | null;
      setMemberInfo({
        full_name: data.full_name,
        member_number: data.member_number,
        center_name: center?.name ?? null,
      });
    })();
    return () => { alive = false; };
  }, [memberId]);

  const amountNum = parseFloat(amount) || 0;
  const shortfall = !isNotPaid && amountNum > 0 && amountNum < weekly ? weekly - amountNum : 0;
  const willComplete = !isNotPaid && remainingBalance > 0 && amountNum >= remainingBalance;

  function toggleSettlement() {
    if (isSettlement) {
      setIsSettlement(false);
      setAmount(weekly.toString());
    } else {
      setIsNotPaid(false);
      setIsSettlement(true);
    }
  }

  const planLabel = principal > 0 ? `Rs. ${principal.toLocaleString()} loan` : 'Loan payment';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isNotPaid && (!amountNum || amountNum <= 0)) {
      toast.error('Please enter the payment amount.');
      return;
    }

    setSaving(true);
    setGpsLoading(true);

    // GPS coordinates are MANDATORY (client requirement) — block the payment if a
    // fix can't be obtained. The address lookup is best-effort (it has its own
    // timeout in reverseGeocode) so a slow geocode never holds up a valid fix.
    let gps: { lat: number; lng: number; address: string };
    try {
      const loc = await captureLocation();
      gps = { lat: loc.lat, lng: loc.lng, address: loc.address ?? '' };
    } catch {
      setGpsLoading(false);
      setSaving(false);
      toast.error('GPS ස්ථානය අවශ්‍යයි — location services on කරන්න.');
      return;
    }
    setGpsLoading(false);

    const fd = new FormData();
    fd.append('loan_id', loanId);
    fd.append('member_id', memberId);
    fd.append('amount_paid', isNotPaid ? '0' : amount);
    fd.append('is_not_paid', isNotPaid.toString());
    fd.append('is_settlement', isSettlement.toString());
    fd.append('gps_lat', gps.lat.toString());
    fd.append('gps_lng', gps.lng.toString());
    fd.append('gps_address', gps.address);

    // A dropped connection must not leave the button stuck on "Saving…" with
    // no feedback — retry is safe because the server's duplicate/idempotency
    // guards absorb a resubmit of the same payment.
    try {
      const result = await recordPaymentAction(fd);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      if (result?.isCompleted) {
        toast.success('ගෙවීම සටහන් විය! ණය සම්පූර්ණයි!');
      } else {
        toast.success('ගෙවීම සටහන් විය!');
      }

      router.back();
      // Ensure the destination page re-fetches (loan_balance, alerts etc.).
      router.refresh();
    } catch {
      toast.error('Connection error — ගෙවීම record වුණාද කියා ස්ථිර නැත. නැවත Save කරන්න (duplicate safe).');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-24">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white -mx-4 px-4 pt-4 pb-6 mb-5">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <CircleDollarSign className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Collect Payment</h1>
            <p className="text-blue-200 text-sm">{planLabel}</p>
          </div>
        </div>

        {/* Member identity — DB-sourced (prevents cross-center misclicks) */}
        <div className="mb-4 bg-white/15 backdrop-blur-sm rounded-2xl border border-white/20 px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <User className="h-5 w-5" />
          </div>
          {memberInfo ? (
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{memberInfo.full_name}</p>
              <p className="text-xs text-blue-200">
                {memberInfo.member_number}
                {memberInfo.center_name ? ' · ' + memberInfo.center_name : ''}
              </p>
            </div>
          ) : (
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-white/20 rounded animate-pulse" />
              <div className="h-2.5 w-24 bg-white/10 rounded animate-pulse" />
            </div>
          )}
        </div>

        {/* Loan summary pills */}
        <div className="flex gap-3 flex-wrap">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20">
            <p className="text-[10px] text-blue-200">Loan Balance</p>
            <p className="font-bold">{formatCurrency(remainingBalance)}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20">
            <p className="text-[10px] text-blue-200">Weekly Due</p>
            <p className="font-bold">{formatCurrency(weekly)}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Paid / N/P toggle */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Payment Status</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsNotPaid(false)}
              className={`rounded-xl py-3.5 font-semibold text-sm transition-all ${
                !isNotPaid
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              Paid
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNotPaid(true);
                // Leaving settlement mode via N/P must also drop the locked
                // full-balance amount, or "Paid" re-arms with the wrong figure.
                if (isSettlement) setAmount(weekly.toString());
                setIsSettlement(false);
              }}
              className={`rounded-xl py-3.5 font-semibold text-sm transition-all ${
                isNotPaid
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              Not Paid (N/P)
            </button>
          </div>
        </div>

        {/* Amount input */}
        {!isNotPaid && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Amount Paid</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">Rs.</span>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max={remainingBalance.toString()}
                step="0.01"
                disabled={isSettlement}
                className="text-2xl h-14 font-bold text-center pl-12 rounded-xl border-gray-200 disabled:opacity-100 disabled:bg-emerald-50"
                required
              />
            </div>
            <div className="flex gap-3 mt-3">
              <button
                type="button"
                onClick={() => { setIsSettlement(false); setAmount(weekly.toString()); }}
                className="flex-1 min-h-[44px] text-sm font-medium text-primary bg-primary/10 py-3 rounded-xl hover:bg-primary/20 transition-colors"
              >
                Weekly ({formatCurrency(weekly)})
              </button>
            </div>
          </div>
        )}

        {/* FULL SETTLEMENT — clears the remaining loan balance in this visit,
            even if today's weekly payment was already recorded. */}
        {!isNotPaid && remainingBalance > 0 && (
          <button
            type="button"
            onClick={toggleSettlement}
            className={`w-full text-left rounded-2xl border p-5 transition-all ${
              isSettlement
                ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                : 'bg-white border-gray-100 shadow-sm hover:border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isSettlement ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800">Settle full balance</p>
                <p className="text-xs text-muted-foreground">
                  Remaining: <strong>{formatCurrency(remainingBalance)}</strong>
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  isSettlement ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isSettlement ? 'ON' : 'OFF'}
              </span>
            </div>
            {isSettlement && (
              <p className="mt-3 text-xs font-medium text-emerald-800 bg-emerald-100 rounded-lg px-3 py-2">
                This clears the loan completely — {formatCurrency(remainingBalance)} will be
                collected and the loan marked as completed.
              </p>
            )}
          </button>
        )}

        {/* Previous outstanding shortfall banner */}
        {prevShortfall > 0 && !isNotPaid && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-800 text-sm">Outstanding shortfall from previous weeks</p>
              <p className="text-xs text-red-700 mt-0.5">
                <strong>{formatCurrency(prevShortfall)}</strong> still owed — collect weekly + shortfall to clear it.
              </p>
              <button
                type="button"
                onClick={() => {
                  // Near loan end weekly+shortfall can exceed the remaining
                  // balance, which the input's max would silently block — in
                  // that case the correct move IS full settlement, so arm it.
                  if (remainingBalance > 0 && weekly + prevShortfall >= remainingBalance) {
                    setIsNotPaid(false);
                    setIsSettlement(true);
                  } else {
                    setIsSettlement(false);
                    setAmount((weekly + prevShortfall).toString());
                  }
                }}
                className="mt-2 min-h-[44px] text-sm font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-4 py-2.5 rounded-lg transition-colors"
              >
                Weekly + Clear Shortfall ({formatCurrency(weekly + prevShortfall)})
              </button>
            </div>
          </div>
        )}

        {/* Shortfall warning (not shown when the payment completes the loan) */}
        {shortfall > 0 && !willComplete && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Shortfall detected</p>
              <p className="text-xs text-amber-700 mt-0.5">
                <strong>{formatCurrency(shortfall)}</strong> below weekly payment — this member will be flagged.
              </p>
            </div>
          </div>
        )}

        {/* Loan completion notice (settlement card shows its own confirmation) */}
        {willComplete && !isSettlement && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-800 text-sm">Loan will be completed!</p>
              <p className="text-xs text-green-700 mt-0.5">This payment clears the full loan balance.</p>
            </div>
          </div>
        )}

        {/* GPS notice */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-3">
          <MapPin className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">GPS location</p>
            <p className="text-xs text-muted-foreground">Automatically captured on save</p>
          </div>
          {gpsLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          className="w-full rounded-2xl h-14 text-base font-semibold"
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {gpsLoading ? 'Getting GPS...' : 'Saving...'}
            </>
          ) : isNotPaid ? (
            'Mark as Not Paid'
          ) : isSettlement ? (
            <>
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Settle Loan ({formatCurrency(remainingBalance)})
            </>
          ) : (
            <>
              <Banknote className="h-5 w-5 mr-2" />
              Save Payment
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

export default function NewPaymentPage() {
  return (
    <Suspense>
      <PaymentForm />
    </Suspense>
  );
}
