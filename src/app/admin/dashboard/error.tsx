'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AdminDashboard] error boundary', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Could not load dashboard</h2>
            <p className="text-xs text-muted-foreground mt-0.5">A query failed while loading the page. Try again or check your connection.</p>
          </div>
        </div>

        {error?.message && (
          <pre className="bg-red-50 border border-red-100 rounded-lg p-3 text-[11px] text-red-800 overflow-x-auto mb-4">
            {error.message}
          </pre>
        )}

        <Button onClick={reset} className="rounded-xl w-full">
          <RefreshCw className="h-4 w-4 mr-2" /> Try Again
        </Button>
      </div>
    </div>
  );
}
