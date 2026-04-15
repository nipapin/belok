'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  TextField,
  Slider,
  Divider,
  Paper,
  Alert,
  CircularProgress,
} from '@mui/material';
import PaymentIcon from '@mui/icons-material/Payment';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotalPrice, clearCart, getItemPrice } = useCartStore();
  const user = useAuthStore((s) => s.user);

  const [bonusUsed, setBonusUsed] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const subtotal = getTotalPrice();
  const discountPercent = user?.loyaltyLevel?.discountPercent || 0;
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const afterDiscount = subtotal - discountAmount;
  const maxBonus = Math.min(
    Math.floor(afterDiscount * 0.3),
    user?.bonusBalance || 0
  );
  const total = afterDiscount - bonusUsed;

  const handleOrder = async () => {
    setError('');
    setLoading(true);
    try {
      const orderItems = items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        customizations: item.customizations.map((c) => ({
          ingredientId: c.ingredientId,
          action: c.action,
          priceDelta: c.priceDelta,
        })),
      }));

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: orderItems, bonusUsed, comment }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка оформления заказа');
        return;
      }

      clearCart();

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        router.push(`/orders/${data.order.id}`);
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (items.length === 0) {
      router.push('/cart');
    }
  }, [items.length, router]);

  if (items.length === 0) {
    return null;
  }

  return (
    <Container maxWidth="sm" sx={{ pt: 2, pb: 2 }}>
      <Typography variant="h2" sx={{ mb: 3 }}>Оформление заказа</Typography>

      {/* Order summary */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Typography variant="h4" sx={{ mb: 1.5 }}>Ваш заказ</Typography>
        {items.map((item) => (
          <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
            <Typography variant="body2">
              {item.name} x{item.quantity}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {getItemPrice(item)} ₽
            </Typography>
          </Box>
        ))}
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2">Подытог</Typography>
          <Typography variant="body2">{subtotal} ₽</Typography>
        </Box>

        {discountAmount > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="body2" color="success.main">
              Скидка {discountPercent}% ({user?.loyaltyLevel?.name})
            </Typography>
            <Typography variant="body2" color="success.main">
              -{discountAmount} ₽
            </Typography>
          </Box>
        )}

        {bonusUsed > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="body2" color="warning.main">Бонусы</Typography>
            <Typography variant="body2" color="warning.main">-{bonusUsed} ₽</Typography>
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h4">Итого</Typography>
          <Typography variant="h4">{total} ₽</Typography>
        </Box>
      </Paper>

      {/* Bonus slider */}
      {user && maxBonus > 0 && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Использовать бонусы
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Доступно: {user.bonusBalance} бонусов (макс. 30% от суммы)
          </Typography>
          <Slider
            value={bonusUsed}
            onChange={(_, v) => setBonusUsed(v as number)}
            min={0}
            max={maxBonus}
            step={1}
            valueLabelDisplay="auto"
            sx={{ color: 'primary.main' }}
          />
          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            Списать: {bonusUsed} бонусов
          </Typography>
        </Paper>
      )}

      {/* Comment */}
      <TextField
        fullWidth
        multiline
        rows={2}
        label="Комментарий к заказу"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Пожелания по заказу..."
        sx={{ mb: 3 }}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {/* Cashback info */}
      {user?.loyaltyLevel && (
        <Alert severity="info" sx={{ mb: 2 }}>
          За этот заказ вам будет начислен кэшбэк {user.loyaltyLevel.cashbackPercent}%
          (~{Math.round(total * (user.loyaltyLevel.cashbackPercent / 100))} бонусов)
        </Alert>
      )}

      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={handleOrder}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={20} /> : <PaymentIcon />}
        sx={{ py: 1.5 }}
      >
        {loading ? 'Оформляем...' : `Оплатить ${total} ₽`}
      </Button>
    </Container>
  );
}
