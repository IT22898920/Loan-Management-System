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
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

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
  const willComplete = !isNotPaid && amountNum >= balance;

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
    fd.append('gps_lat', gps.lat.toString());
    fd.append('gps_lng', gps.lng.toString());
    fd.append('gps_address', gps.address);

    const result = await recordPaymentAction(fd);
    setSaving(false);

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
            <p className="font-bold">{formatCurrency(balance)}</p>
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
              onClick={() => setIsNotPaid(true)}
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
                max={balance.toString()}
                step="0.01"
                className="text-2xl h-14 font-bold text-center pl-12 rounded-xl border-gray-200"
                required
              />
            </div>
            <div className="flex gap-3 mt-3">
              <button
                type="button"
                onClick={() => setAmount(weekly.toString())}
                className="flex-1 min-h-[44px] text-sm font-medium text-primary bg-primary/10 py-3 rounded-xl hover:bg-primary/20 transition-colors"
              >
                Weekly ({formatCurrency(weekly)})
              </button>
              <button
                type="button"
                onClick={() => setAmount(balance.toString())}
                className="flex-1 min-h-[44px] text-sm font-medium text-amber-700 bg-amber-50 py-3 rounded-xl hover:bg-amber-100 transition-colors"
              >
                Full Balance ({formatCurrency(balance)})
              </button>
            </div>
          </div>
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
                onClick={() => setAmount((weekly + prevShortfall).toString())}
                className="mt-2 min-h-[44px] text-sm font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-4 py-2.5 rounded-lg transition-colors"
              >
                Weekly + Clear Shortfall ({formatCurrency(weekly + prevShortfall)})
              </button>
            </div>
          </div>
        )}

        {/* Shortfall warning */}
        {shortfall > 0 && (
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

        {/* Loan completion notice */}
        {willComplete && (
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
