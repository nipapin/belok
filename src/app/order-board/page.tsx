import type { Metadata } from 'next';
import OrderBoard from '@/components/orders/OrderBoard';
import './order-board.css';

export const metadata: Metadata = {
  title: 'Экран заказов — бело́к',
  robots: { index: false, follow: false },
};

export default function OrderBoardPage() {
  return <OrderBoard />;
}
