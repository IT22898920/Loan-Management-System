/**
 * What a payment row really is.
 *
 * Imported history copies every weekly cell of the client's Excel sheet 1:1,
 * including weeks in which no money changed hands: markers such as NEW (the
 * loan had not started yet), A/H (holiday week), N/A, SP, D — and plain 0
 * cells. Those rows must not look like payments ("LKR 0.00 ✓") or be counted
 * as payments made. N/P stays exactly as recorded (client requirement).
 */
export type PaymentKind = 'paid' | 'shortfall' | 'not_paid' | 'marker' | 'none';

export function paymentKind(p: {
  amount_paid: number | string;
  is_not_paid: boolean;
  shortfall: number | string;
  marker?: string | null;
}): PaymentKind {
  if (p.is_not_paid) return 'not_paid';
  if (Number(p.amount_paid) > 0) return Number(p.shortfall) > 0 ? 'shortfall' : 'paid';
  return p.marker ? 'marker' : 'none';
}

/** The sheet marker as users know it ('.NEW' -> 'NEW'). */
export function markerLabel(marker: string | null | undefined): string {
  const m = (marker ?? '').trim().replace(/^\.+/, '').toUpperCase();
  return m || '—';
}

/** True when money was actually received in this row. */
export function isMoneyPayment(p: { amount_paid: number | string; is_not_paid: boolean }): boolean {
  return !p.is_not_paid && Number(p.amount_paid) > 0;
}
