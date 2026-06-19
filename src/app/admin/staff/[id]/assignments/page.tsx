'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Check, CalendarDays, Info, UserCheck, Filter, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { Center, DayOfWeek, DAYS_OF_WEEK } from '@/types';
import { updateStaffAssignmentsAction } from '@/app/actions/staff';

type Assignment = { centerId: string; day: DayOfWeek };

// Other staff occupying a cell
interface OccupiedBy {
  staffId: string;
  staffName: string;
  color: string;
}

// Staff stats for filter sidebar
interface StaffStat {
  staffId: string;
  staffName: string;
  color: string;
  totalCenters: number;
  perDay: Record<DayOfWeek, number>;
}

const SELF_FILTER = '__self__';
const ALL_FILTER = '__all__';

const STAFF_COLORS = [
  'bg-orange-400', 'bg-rose-400', 'bg-amber-400',
  'bg-purple-400', 'bg-teal-400', 'bg-red-400',
];

export default function StaffAssignmentsPage() {
  const params = useParams();
  const staffId = params.id as string;

  const [centers, setCenters] = useState<Center[]>([]);
  const [staffName, setStaffName] = useState('');
  const [selected, setSelected] = useState<Assignment[]>([]);
  // Map of "centerId_day" -> OccupiedBy (by OTHER staff)
  const [occupied, setOccupied] = useState<Map<string, OccupiedBy>>(new Map());
  // Cells being taken from other staff (pending reassignment)
  const [taking, setTaking] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [staffFilter, setStaffFilter] = useState<string>(ALL_FILTER);
  const [dayFilter, setDayFilter] = useState<Set<DayOfWeek>>(
    new Set(DAYS_OF_WEEK.map((d) => d.value as DayOfWeek)),
  );

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [{ data: profile }, { data: centersData }, { data: existing }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', staffId).single(),
        supabase.from('centers').select('*').order('center_number'),
        supabase.from('staff_center_assignments').select('*').eq('staff_id', staffId),
      ]);

      setStaffName(profile?.full_name ?? '');
      const loadedCenters = centersData ?? [];
      setCenters(loadedCenters);
      setSelected((existing ?? []).map((a) => ({ centerId: a.center_id, day: a.day_of_week as DayOfWeek })));

      // Fetch ALL OTHER staff assignments for these centers
      const centerIds = loadedCenters.map((c) => c.id);
      if (centerIds.length > 0) {
        const { data: allOthers } = await supabase
          .from('staff_center_assignments')
          .select('center_id, day_of_week, staff_id, staff:profiles(full_name)')
          .neq('staff_id', staffId)
          .in('center_id', centerIds);

        // Build a stable color per staff member
        const staffColorMap = new Map<string, string>();
        let colorIdx = 0;

        const newOccupied = new Map<string, OccupiedBy>();
        for (const a of allOthers ?? []) {
          const staffName = (a.staff as unknown as { full_name: string } | null)?.full_name ?? 'Unknown';
          if (!staffColorMap.has(a.staff_id)) {
            staffColorMap.set(a.staff_id, STAFF_COLORS[colorIdx % STAFF_COLORS.length]);
            colorIdx++;
          }
          newOccupied.set(`${a.center_id}_${a.day_of_week}`, {
            staffId: a.staff_id,
            staffName,
            color: staffColorMap.get(a.staff_id)!,
          });
        }
        setOccupied(newOccupied);
      }

      setLoading(false);
    }
    load();
  }, [staffId]);

  const cellKey = (centerId: string, day: DayOfWeek) => `${centerId}_${day}`;

  function isSelected(centerId: string, day: DayOfWeek) {
    return selected.some((s) => s.centerId === centerId && s.day === day);
  }

  // Compute per-staff statistics (current staff + all others)
  const staffStats = useMemo<StaffStat[]>(() => {
    const stats = new Map<string, StaffStat>();

    // Current (self) staff
    const selfPerDay: Record<DayOfWeek, number> = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0 };
    for (const s of selected) selfPerDay[s.day]++;
    stats.set(staffId, {
      staffId,
      staffName: staffName || 'Self',
      color: 'bg-primary',
      totalCenters: selected.length,
      perDay: selfPerDay,
    });

    // Other staff (from occupied map)
    for (const [, occ] of occupied) {
      const existing = stats.get(occ.staffId);
      if (existing) {
        existing.totalCenters++;
      } else {
        stats.set(occ.staffId, {
          staffId: occ.staffId,
          staffName: occ.staffName,
          color: occ.color,
          totalCenters: 1,
          perDay: { monday: 0, tuesday: 0, wednesday: 0, thursday: 0 },
        });
      }
    }
    // Per-day counts for others
    for (const [key, occ] of occupied) {
      const day = key.split('_')[1] as DayOfWeek;
      const s = stats.get(occ.staffId);
      if (s) s.perDay[day]++;
    }

    return Array.from(stats.values()).sort((a, b) => b.totalCenters - a.totalCenters);
  }, [selected, occupied, staffId, staffName]);

  function toggleDay(day: DayOfWeek) {
    setDayFilter((prev) => {
      const n = new Set(prev);
      if (n.has(day)) { if (n.size > 1) n.delete(day); }
      else n.add(day);
      return n;
    });
  }

  function resetFilters() {
    setStaffFilter(ALL_FILTER);
    setDayFilter(new Set(DAYS_OF_WEEK.map((d) => d.value as DayOfWeek)));
  }

  const filtersActive = staffFilter !== ALL_FILTER || dayFilter.size < DAYS_OF_WEEK.length;

  // Filter visible days
  const visibleDays = useMemo(
    () => DAYS_OF_WEEK.filter((d) => dayFilter.has(d.value as DayOfWeek)),
    [dayFilter],
  );

  // Filter visible centers based on staff filter + day filter
  const visibleCenters = useMemo(() => {
    if (staffFilter === ALL_FILTER) return centers;

    const focusedStaffId = staffFilter === SELF_FILTER ? staffId : staffFilter;

    return centers.filter((c) => {
      // Check if focused staff has assignment in any of the visible days
      for (const { value } of visibleDays) {
        const day = value as DayOfWeek;
        if (focusedStaffId === staffId) {
          if (isSelected(c.id, day)) return true;
        } else {
          const occ = occupied.get(cellKey(c.id, day));
          if (occ && occ.staffId === focusedStaffId) return true;
        }
      }
      return false;
    });
  }, [centers, staffFilter, staffId, occupied, selected, visibleDays]);

  function toggle(centerId: string, day: DayOfWeek) {
    const key = cellKey(centerId, day);
    const isMine = isSelected(centerId, day);
    const isTaking = taking.has(key);
    const occupant = occupied.get(key);

    if (isMine) {
      // Deselect own
      setSelected((prev) => prev.filter((s) => !(s.centerId === centerId && s.day === day)));
      setTaking((prev) => { const n = new Set(prev); n.delete(key); return n; });
    } else if (occupant && !isTaking) {
      // Click on occupied cell → mark as "taking" (will be reassigned on save)
      setSelected((prev) => [...prev, { centerId, day }]);
      setTaking((prev) => new Set(prev).add(key));
    } else if (occupant && isTaking) {
      // Click again to cancel taking
      setSelected((prev) => prev.filter((s) => !(s.centerId === centerId && s.day === day)));
      setTaking((prev) => { const n = new Set(prev); n.delete(key); return n; });
    } else {
      // Empty cell → assign
      setSelected((prev) => [...prev, { centerId, day }]);
    }
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateStaffAssignmentsAction(staffId, selected);
    setSaving(false);
    if (result?.error) { toast.error(result.error); return; }
    toast.success('Assignments saved!');
    // Refresh the page data
    window.location.reload();
  }

  const takingCount = taking.size;

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <Link href="/admin/staff" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Staff
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-xl font-bold">
            {staffName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Assign Centers</h1>
            <p className="text-blue-200 text-sm mt-0.5">{staffName}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 flex flex-wrap gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20">
            <span className="text-blue-200 text-xs">Selected: </span>
            <span className="font-bold">{selected.length}</span>
          </div>
          {takingCount > 0 && (
            <div className="bg-orange-500/30 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-orange-300/30">
              <span className="text-orange-200 text-xs">Reassigning: </span>
              <span className="font-bold text-orange-200">{takingCount}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">
        {/* Legend */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-primary flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-white" />
              </div>
              <span>Assigned to <strong>{staffName}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-orange-400 flex items-center justify-center text-white text-[10px] font-bold">S</div>
              <span>Assigned to another staff (click to reassign here)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-primary/20 border-2 border-primary border-dashed flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-primary" />
              </div>
              <span>Will be reassigned from other staff on save</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-gray-100" />
              <span>Available</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <p className="text-xs text-blue-600 font-medium">Each center can have only 1 staff member per day. Assigning here will automatically remove the existing staff from that slot.</p>
          </div>
        </div>

        {/* Staff Statistics */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Staff Center Counts</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Click a card to filter by staff member</p>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {staffStats.map((s) => {
              const isSelf = s.staffId === staffId;
              const isActive = staffFilter === (isSelf ? SELF_FILTER : s.staffId);
              return (
                <button
                  key={s.staffId}
                  onClick={() => setStaffFilter(isActive ? ALL_FILTER : isSelf ? SELF_FILTER : s.staffId)}
                  className={`relative text-left rounded-xl border p-3 transition-all hover:shadow-sm ${
                    isActive
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                      : 'border-gray-100 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {s.staffName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 truncate">
                        {s.staffName}{isSelf && <span className="text-primary"> (You)</span>}
                      </p>
                      <p className="text-[10px] text-gray-500">{s.totalCenters} centers</p>
                    </div>
                  </div>
                  <div className="flex gap-1 text-[10px] text-gray-500">
                    {DAYS_OF_WEEK.map((d) => (
                      <span key={d.value} className="flex-1 text-center bg-gray-50 rounded py-0.5">
                        <span className="block font-medium text-gray-700">{s.perDay[d.value as DayOfWeek]}</span>
                        <span className="block">{d.label.split('(')[0].trim().slice(0, 3)}</span>
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filter by Day:</span>
            </div>
            <div className="flex flex-wrap gap-2 flex-1">
              {DAYS_OF_WEEK.map((d) => {
                const active = dayFilter.has(d.value as DayOfWeek);
                return (
                  <button
                    key={d.value}
                    onClick={() => toggleDay(d.value as DayOfWeek)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {d.label.split('(')[0].trim()}
                  </button>
                );
              })}
            </div>
            {filtersActive && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
          </div>
          {filtersActive && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
              <Info className="h-3.5 w-3.5 text-blue-500" />
              Showing <strong>{visibleCenters.length}</strong> of <strong>{centers.length}</strong> centers
              {staffFilter !== ALL_FILTER && (() => {
                const focused = staffStats.find(s =>
                  staffFilter === SELF_FILTER ? s.staffId === staffId : s.staffId === staffFilter
                );
                return focused ? <> · filtered by <strong>{focused.staffName}</strong></> : null;
              })()}
            </div>
          )}
        </div>

        {/* Assignment grid */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Weekly Schedule</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Click a cell to assign or unassign</p>
            </div>
          </div>

          <div className="p-5 overflow-x-auto">
            {visibleCenters.length === 0 ? (
              <div className="py-16 text-center">
                <Filter className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No centers match current filters.</p>
                <button onClick={resetFilters} className="text-xs text-primary hover:underline mt-2">Clear filters</button>
              </div>
            ) : (
            <table className="w-full border-collapse min-w-[420px] sm:min-w-[500px]">
              <thead>
                <tr>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100 w-32 sm:w-48">
                    Center
                  </th>
                  {visibleDays.map(({ value, label }) => (
                    <th key={value} className="text-center py-3 px-2 font-medium text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                      {label.split('(')[0].trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleCenters.map((center) => (
                  <tr key={center.id} className="hover:bg-gray-50/30">
                    <td className="py-4 px-3">
                      <span className="text-xs text-muted-foreground mr-1.5">#{center.center_number}</span>
                      <span className="font-semibold text-gray-800 text-sm">{center.name}</span>
                    </td>
                    {visibleDays.map(({ value }) => {
                      const key = cellKey(center.id, value);
                      const isMine = isSelected(center.id, value);
                      const isTaking = taking.has(key);
                      const occupant = occupied.get(key);

                      return (
                        <td key={value} className="py-4 px-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => toggle(center.id, value)}
                              title={
                                isMine && !isTaking
                                  ? `Remove ${staffName} from this slot`
                                  : occupant && !isTaking
                                  ? `Currently: ${occupant.staffName}. Click to reassign to ${staffName}`
                                  : isTaking
                                  ? `Will reassign from ${occupant?.staffName ?? '?'}. Click to cancel`
                                  : `Assign ${staffName} here`
                              }
                              className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto transition-all text-xs font-bold ${
                                isMine && !isTaking
                                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30'
                                  : isTaking
                                  ? 'bg-primary/20 text-primary border-2 border-primary border-dashed'
                                  : occupant
                                  ? `${occupant.color} text-white opacity-80 hover:opacity-100`
                                  : 'bg-gray-100 text-gray-300 hover:bg-primary/10 hover:text-primary'
                              }`}
                            >
                              {isMine && !isTaking ? (
                                <Check className="h-4 w-4" />
                              ) : isTaking ? (
                                <Check className="h-4 w-4" />
                              ) : occupant ? (
                                occupant.staffName.charAt(0).toUpperCase()
                              ) : null}
                            </button>

                            {/* Staff name label under occupied cells */}
                            {occupant && !isMine && (
                              <span className={`text-[9px] font-medium leading-tight max-w-[52px] truncate ${isTaking ? 'text-primary' : 'text-gray-400'}`}>
                                {isTaking ? '→ ' + staffName.split(' ')[0] : occupant.staffName.split(' ')[0]}
                              </span>
                            )}
                            {isMine && !occupant && (
                              <span className="text-[9px] font-medium text-primary leading-tight max-w-[52px] truncate">
                                {staffName.split(' ')[0]}
                              </span>
                            )}
                            {isTaking && occupant && (
                              <span className="text-[9px] font-medium text-orange-400 line-through leading-tight max-w-[52px] truncate">
                                {occupant.staffName.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>

          {/* Reassignment warning */}
          {takingCount > 0 && (
            <div className="mx-5 mb-5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <UserCheck className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
              <p className="text-xs text-orange-700">
                <strong>{takingCount} slot{takingCount > 1 ? 's' : ''}</strong> will be reassigned from another staff member to <strong>{staffName}</strong> when you save.
                The previous staff member will lose those assignments.
              </p>
            </div>
          )}

          <div className="px-5 pb-5 flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : 'Save Assignments'}
            </Button>
            <Button variant="outline" className="rounded-xl" asChild>
              <Link href="/admin/staff">Cancel</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
