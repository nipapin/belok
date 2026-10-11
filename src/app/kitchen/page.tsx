import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/roles';
import { getCurrentUser } from '@/lib/auth';
import KitchenApp from '@/components/kitchen/KitchenApp';
import './kitchen.css';

export const metadata: Metadata = {
  title: 'Кухня · бело́к',
  description: 'Технологические карты и пошаговое приготовление блюд',
  robots: { index: false, follow: false },
};

export default async function KitchenPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/?auth=1&redirect=%2Fkitchen');
  if (!hasPermission(user, 'kitchen')) redirect('/menu');
  return <KitchenApp />;
}
