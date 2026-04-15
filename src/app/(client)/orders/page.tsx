'use client';

import { useRouter } from 'next/navigation';
import {
  Box, Container, Typography, Paper, Chip, Skeleton,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useQuery } from '@tanstack/react-query';

const statusMap: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error' }> = {
  PENDING: { label: 'Ожидает', color: 'default' },
  CONFIRMED: { label: 'Подтверждён', color: 'info' },
  PREPARING: { label: 'Готовится', color: 'warning' },
  READY: { label: 'Готов к выдаче', color: 'success' },
  COMPLETED: { label: 'Выполнен', color: 'success' },
  CANCELLED: { label: 'Отменён', color: 'error' },
};

interface Order {
  id: string;
  status: string;
  total: number;
  bonusEarned: number;
  createdAt: string;
  items: { product: { name: string }; quantity: number }[];
}

export default function OrdersPage() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => fetch('/api/orders').then((r) => r.json()),
  });

  const orders: Order[] = data?.orders ?? [];

  return (
    <Container maxWidth="sm" sx={{ pt: 2, pb: 2 }}>
      <Typography variant="h2" sx={{ mb: 2 }}>Мои заказы</Typography>

      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={100} sx={{ mb: 1.5, borderRadius: 3 }} />
          ))
        : orders.length === 0
        ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <ReceiptLongIcon sx={{ fontSize: 64, color: 'text.secondary', opacity: 0.3, mb: 2 }} />
            <Typography variant="h3" color="text.secondary">Заказов пока нет</Typography>
          </Box>
        )
        : orders.map((order) => {
            const s = statusMap[order.status] || { label: order.status, color: 'default' as const };
            return (
              <Paper
                key={order.id}
                elevation={0}
                onClick={() => router.push(`/orders/${order.id}`)}
                sx={{
                  p: 2,
                  mb: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 3,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#FAFAFA' },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Заказ #{order.id.slice(0, 8)}
                  </Typography>
                  <Chip label={s.label} size="small" color={s.color} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {order.items.map((i) => `${i.product.name} x${i.quantity}`).join(', ')}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(order.createdAt).toLocaleString('ru')}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{order.total} ₽</Typography>
                </Box>
                {order.bonusEarned > 0 && (
                  <Typography variant="caption" color="success.main">
                    +{order.bonusEarned} бонусов
                  </Typography>
                )}
              </Paper>
            );
          })}
    </Container>
  );
}
