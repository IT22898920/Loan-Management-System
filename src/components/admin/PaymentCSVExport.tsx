'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface PaymentRow {
  payment_date: string;
  member_full_name: string;
  member_number: string;
  loan_plan: string | number;
  amount_paid: number;
  is_not_paid: boolean | string;
  shortfall: number;
  staff_name: string;
  gps_address: string;
  gps_lat?: number | null;
  gps_lng?: number | null;
}

export default function PaymentCSVExport({ data }: { data: PaymentRow[] }) {
  function exportCSV() {
    const q = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const planLabel = (plan: string | number) => {
      const n = Number(plan);
      return n === 5000 ? '5,000' : n === 10000 ? '10,000' : n === 20000 ? '20,000' : String(plan);
    };

    const headers = [
      'Date',
      'Member Name',
      'Member #',
      'Loan Plan',
      'Status',
      'Amount Paid (LKR)',
      'Shortfall (LKR)',
      'Staff Name',
      'GPS Address',
      'GPS Lat',
      'GPS Lng',
    ];

    const rows = data.map((p) => {
      const isNP = p.is_not_paid === true || p.is_not_paid === 'Yes' || p.is_not_paid === 'true';
      const sf = Number(p.shortfall ?? 0);
      const status = isNP ? 'Not Paid' : sf > 0 ? 'Shortfall' : 'Paid';
      return [
        p.payment_date,
        q(p.member_full_name),
        p.member_number,
        planLabel(p.loan_plan),
        status,
        isNP ? '0.00' : Number(p.amount_paid).toFixed(2),
        sf.toFixed(2),
        q(p.staff_name),
        q(p.gps_address),
        p.gps_lat ?? '',
        p.gps_lng ?? '',
      ];
    });

    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={exportCSV}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  );
}
