import KioskApp from '@/components/kiosk/KioskApp';
import { brandMark } from '@/lib/brand';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `${brandMark} — терминал`,
  robots: { index: false, follow: false },
};

export default function KioskPage() {
  return <KioskApp />;
}
