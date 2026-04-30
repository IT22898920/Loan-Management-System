import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import StaffNavbar from '@/components/staff/StaffNavbar';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'staff') redirect('/admin/dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <StaffNavbar profile={profile} />
      <main className="max-w-2xl mx-auto px-4 pt-[72px] pb-[80px]">
        {children}
      </main>
    </div>
  );
}
