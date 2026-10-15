import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';

export default async function DashboardHomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return <DashboardOverview name={user.name} timezone={user.timezone} />;
}
