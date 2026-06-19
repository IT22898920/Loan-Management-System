'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[staff/report] error boundary', error);
  }, [error]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">වාර්තා page එක load කරන්න නොහැක</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Internet check කරලා නැවත try කරන්න. දත්ත සුරක්ෂිතව තියෙනවා.
          </p>
        </div>
      </div>

      {error?.message && (
        <pre className="bg-red-50 border border-red-100 rounded-lg p-3 text-[11px] text-red-800 overflow-x-auto mb-4">
          {error.message}
        </pre>
      )}

      <div className="flex gap-2">
        <Button onClick={reset} className="rounded-xl flex-1">
          <RefreshCw className="h-4 w-4 mr-2" /> Try Again
        </Button>
        <Button variant="outline" className="rounded-xl" asChild>
          <Link href="/staff/dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Link>
        </Button>
      </div>
    </div>
  );
}
