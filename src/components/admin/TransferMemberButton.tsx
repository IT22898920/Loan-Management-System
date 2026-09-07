'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { transferMemberAction } from '@/app/actions/members';

interface CenterOption { id: string; name: string; center_number: number }

export default function TransferMemberButton({
  memberId, memberName, currentCenterId, currentCenterName, activeLoanCount, centers,
}: {
  memberId: string;
  memberName: string;
  currentCenterId: string | null;
  currentCenterName: string | null;
  activeLoanCount: number;
  centers: CenterOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toCenterId, setToCenterId] = useState('');
  const [saving, setSaving] = useState(false);

  const blocked = activeLoanCount > 0;
  const options = centers.filter((c) => c.id !== currentCenterId);

  async function handleTransfer() {
    if (!toCenterId) { toast.error('Select the new center first.'); return; }
    setSaving(true);
    const result = await transferMemberAction(memberId, toCenterId);
    setSaving(false);
    if (result?.error) { toast.error(result.error); return; }
    const target = options.find((c) => c.id === toCenterId);
    toast.success(`${memberName} transferred to ${target?.name ?? 'new center'}.`);
    setOpen(false);
    setToCenterId('');
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white px-4 py-2 text-sm font-medium transition-colors"
      >
        <ArrowRightLeft className="h-4 w-4" />
        Transfer Member
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !saving && setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 text-lg">Transfer {memberName}</h2>
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {blocked ? (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 leading-relaxed">
                  This member has an <strong>active loan</strong>. The loan must be
                  fully settled before a transfer is allowed.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Current center: <strong className="text-gray-800">{currentCenterName ?? '—'}</strong>
                </p>
                <Select value={toCenterId} onValueChange={setToCenterId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select new center…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {options.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        #{c.center_number} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The transfer is recorded with date and the previous center, and
                  will show on the member&apos;s profile.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              {!blocked && (
                <Button className="rounded-xl" onClick={handleTransfer} disabled={saving || !toCenterId}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  Transfer
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
