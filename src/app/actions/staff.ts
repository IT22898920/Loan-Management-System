'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { DayOfWeek } from '@/types';

export async function updateStaffAssignmentsAction(
  staffId: string,
  assignments: { centerId: string; day: DayOfWeek }[]
) {
  const supabase = await createClient();

  // 1. Delete all existing assignments for THIS staff member
  const { error: delErr } = await supabase
    .from('staff_center_assignments')
    .delete()
    .eq('staff_id', staffId);

  if (delErr) return { error: delErr.message };

  if (assignments.length === 0) {
    revalidatePath(`/admin/staff/${staffId}/assignments`);
    revalidatePath('/admin/staff');
    return { success: true };
  }

  // 2. Remove conflicting assignments from OTHER staff
  //    Rule: max 1 staff per center per day
  for (const { centerId, day } of assignments) {
    await supabase
      .from('staff_center_assignments')
      .delete()
      .eq('center_id', centerId)
      .eq('day_of_week', day)
      .neq('staff_id', staffId); // only remove OTHER staff's conflicts
  }

  // 3. Insert new assignments for this staff
  const rows = assignments.map(({ centerId, day }) => ({
    staff_id: staffId,
    center_id: centerId,
    day_of_week: day,
  }));

  const { error: insErr } = await supabase.from('staff_center_assignments').insert(rows);

  if (insErr) return { error: insErr.message };

  revalidatePath(`/admin/staff/${staffId}/assignments`);
  revalidatePath('/admin/staff');
  return { success: true };
}
