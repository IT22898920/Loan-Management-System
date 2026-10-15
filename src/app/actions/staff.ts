'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { safeError } from '@/lib/safe-error';
import { DayOfWeek } from '@/types';

export interface MovedCenter {
  center_id: string;
  center_name: string;
  from_staff_id: string;
  from_staff_name: string | null;
}

export async function updateStaffAssignmentsAction(
  staffId: string,
  assignments: { centerId: string; day: DayOfWeek }[]
): Promise<{ error: string } | { success: true; moved: MovedCenter[] }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();

  // A center belongs to exactly ONE staff member (migration 033). The RPC
  // replaces this staff member's schedule and MOVES every chosen center away
  // from whoever held it — all in one transaction, so a failure can never
  // leave anyone with half a schedule.
  const { data, error } = await supabase.rpc('set_staff_assignments', {
    p_staff_id: staffId,
    p_assignments: assignments.map(({ centerId, day }) => ({ center_id: centerId, day })),
  });

  if (error) {
    // 23P01 = exclusion violation: another admin gave one of these centers to
    // someone else between page load and save.
    if (error.code === '23P01') {
      return { error: 'One of these centers was just assigned to another staff member. Reload the page and try again.' };
    }
    return { error: safeError(error, 'Could not save assignments.') };
  }

  revalidatePath(`/admin/staff/${staffId}/assignments`);
  revalidatePath('/admin/staff');
  const moved = (data as { moved?: MovedCenter[] } | null)?.moved ?? [];
  return { success: true, moved };
}
