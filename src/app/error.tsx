'use client';

import { useEffect } from 'react';
import { WifiOff, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isNetwork = /fetch failed|timeout|timed out|network|ECONN|ENOTFOUND|UND_ERR/i.test(
    `${error?.message ?? ''} ${error?.digest ?? ''}`
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${isNetwork ? 'bg-amber-50' : 'bg-red-50'}`}>
          {isNetwork ? (
            <WifiOff className="h-7 w-7 text-amber-500" />
          ) : (
            <RotateCcw className="h-7 w-7 text-red-500" />
          )}
        </div>

        <h1 className="text-lg font-bold text-gray-900 mt-5">
          {isNetwork ? 'Connection problem' : 'Something went wrong'}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {isNetwork
            ? 'Could not reach the server. Check your internet connection (a VPN or weak mobile signal can cause this) and try again.'
            : 'An unexpected error occurred while loading this page. You can try again.'}
        </p>

        <div className="flex items-center justify-center gap-2 mt-6">
          <Button onClick={() => reset()} className="rounded-xl">
            <RefreshCw className="h-4 w-4 mr-2" /> Try Again
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>

        {error?.digest && (
          <p className="text-[11px] text-gray-300 mt-5">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
