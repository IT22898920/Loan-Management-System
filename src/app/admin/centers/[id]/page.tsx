import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft, Building2, Hash, Users, Calendar, UserCog, ChevronRight, Phone } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

const DAY_LABEL: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
};

interface CenterMember {
  id: string;
  member_number: string;
  full_name: string;
  phone: string | null;
  loans: { id: string; principal: number | null; loan_balance: number; weekly_payment: number; status: string; issued_date: string }[];
}

export default async function CenterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: center } = await supabase
    .from('centers')
    .select('id, name, center_number, collection_day, manager_name')
    .eq('id', id)
    .single();

  if (!center) notFound();

  const { data: membersRaw } = await supabase
    .from('members')
    .select('id, member_number, full_name, phone, loans(id, principal, loan_balance, weekly_payment, status, issued_date)')
    .eq('center_id', id)
    .order('member_number');

  const members = (membersRaw ?? []) as unknown as CenterMember[];

  const withActive = members
    .map((m) => {
      const active = m.loans.filter((l) => l.status === 'active');
      return { ...m, active, totalLB: active.reduce((s, l) => s + l.loan_balance, 0) };
    })
    .sort((a, b) => b.active.length - a.active.length || b.totalLB - a.totalLB);

  const totalActiveLoans = withActive.reduce((s, m) => s + m.active.length, 0);
  const totalOutstanding = withActive.reduce((s, m) => s + m.totalLB, 0);
  const activeMembers = withActive.filter((m) => m.active.length > 0).length;

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <Link href="/admin/centers" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Centers
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{center.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-blue-200 text-sm flex-wrap">
              <span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" />Center {center.center_number}</span>
              {center.collection_day && (
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{DAY_LABEL[center.collection_day] ?? center.collection_day}</span>
              )}
              {center.manager_name && (
                <span className="flex items-center gap-1"><UserCog className="h-3.5 w-3.5" />{center.manager_name}</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-3 max-w-lg">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Members</p>
            <p className="text-xl font-bold mt-0.5">{members.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Active Loans</p>
            <p className="text-xl font-bold mt-0.5">{totalActiveLoans}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
            <p className="text-blue-200 text-xs">Outstanding</p>
            <p className="text-lg font-bold mt-0.5">{formatCurrency(totalOutstanding)}</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Members</h2>
              <p className="text-xs text-muted-foreground">{activeMembers} with active loans · {members.length - activeMembers} settled / no loan</p>
            </div>
          </div>

          {members.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No members in this center</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {withActive.map((m) => {
                const topPrincipal = m.active[0]?.principal ?? null;
                return (
                  <Link
                    key={m.id}
                    href={`/admin/members/${m.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/70 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${m.active.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.full_name?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{m.full_name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{m.member_number}</span>
                        {m.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{m.phone}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {m.active.length > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(m.totalLB)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {m.active.length} active{topPrincipal ? ` · Rs. ${Math.round(topPrincipal / 1000)}K` : ''}
                          </p>
                        </>
                      ) : (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700">Settled</span>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
