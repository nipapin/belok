'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  Box, Container, Typography, Paper, Chip, Divider, Button, Skeleton,
  Stepper, Step, StepLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useQuery } from '@tanstack/react-query';

const statusSteps = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];
const statusLabels: Record<string, string> = {
  PENDING: 'Ожидает',
  CONFIRMED: 'Подтверждён',
  PREPARING: 'Готовится',
  READY: 'Готов',
  COMPLETED: 'Выполнен',
  CANCELLED: 'Отменён',
};

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  product: { name: string; image: string | null };
  customizations: { ingredientId: string; action: string; priceDelta: number }[];
}

interface Order {
  id: string;
  status: string;
  total: number;
  discountAmount: number;
  bonusUsed: number;
  bonusEarned: number;
  paymentStatus: string;
  comment: string | null;
  createdAt: string;
  items: OrderItem[];
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetch(`/api/orders/${id}`).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const order: Order | undefined = data?.order;

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ pt: 2 }}>
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />
      </Container>
    );
  }

  if (!order) {
    return (
      <Container maxWidth="sm" sx={{ pt: 4, textAlign: 'center' }}>
        <Typography variant="h3">Заказ не найден</Typography>
        <Button onClick={() => router.push('/orders')} sx={{ mt: 2 }}>Назад</Button>
      </Container>
    );
  }

  const activeStep = order.status === 'CANCELLED'
    ? -1
    : statusSteps.indexOf(order.status);

  return (
    <Container maxWidth="sm" sx={{ pt: 2, pb: 2 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/orders')}
        sx={{ mb: 2 }}
      >
        Назад
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h2">Заказ #{order.id.slice(0, 8)}</Typography>
        <Chip
          label={statusLabels[order.status]}
          color={order.status === 'CANCELLED' ? 'error' : order.status === 'COMPLETED' ? 'success' : 'info'}
        />
      </Box>

      {/* Progress stepper */}
      {order.status !== 'CANCELLED' && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {statusSteps.map((step) => (
              <Step key={step}>
                <StepLabel>{statusLabels[step]}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Paper>
      )}

      {/* Items */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Typography variant="h4" sx={{ mb: 1.5 }}>Состав заказа</Typography>
        {order.items.map((item) => (
          <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 1 }}>
            <Box>
              <Typography variant="body2">{item.product.name} x{item.quantity}</Typography>
              {item.customizations.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {item.customizations.map((c) =>
                    c.action === 'REMOVE' ? `Без: ${c.ingredientId}` : `+${c.ingredientId}`
                  ).join(', ')}
                </Typography>
              )}
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {item.unitPrice * item.quantity} ₽
            </Typography>
          </Box>
        ))}

        <Divider sx={{ my: 1.5 }} />

        {order.discountAmount > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="success.main">Скидка</Typography>
            <Typography variant="body2" color="success.main">-{order.discountAmount} ₽</Typography>
          </Box>
        )}
        {order.bonusUsed > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="warning.main">Бонусы</Typography>
            <Typography variant="body2" color="warning.main">-{order.bonusUsed} ₽</Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="h4">Итого</Typography>
          <Typography variant="h4">{order.total} ₽</Typography>
        </Box>
        {order.bonusEarned > 0 && (
          <Typography variant="caption" color="success.main">
            Начислено бонусов: +{order.bonusEarned}
          </Typography>
        )}
      </Paper>

      {order.comment && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="h4" sx={{ mb: 0.5 }}>Комментарий</Typography>
          <Typography variant="body2" color="text.secondary">{order.comment}</Typography>
        </Paper>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
        Оплата: {order.paymentStatus === 'SUCCEEDED' ? 'Оплачен' : order.paymentStatus}
        {' · '}
        {new Date(order.createdAt).toLocaleString('ru')}
      </Typography>
    </Container>
  );
}
