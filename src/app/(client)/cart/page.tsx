'use client';

import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  IconButton,
  Divider,
  Paper,
  Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useCartStore } from '@/store/cartStore';

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, getItemPrice, getTotalPrice, clearCart } = useCartStore();

  if (items.length === 0) {
    return (
      <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}>
        <ShoppingCartIcon sx={{ fontSize: 80, color: 'text.secondary', opacity: 0.3, mb: 2 }} />
        <Typography variant="h3" sx={{ mb: 1 }}>
          Корзина пуста
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Добавьте блюда из меню
        </Typography>
        <Button variant="contained" onClick={() => router.push('/menu')}>
          Перейти в меню
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ pt: 2, pb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h2">Корзина</Typography>
        <Button size="small" color="error" onClick={clearCart}>
          Очистить
        </Button>
      </Box>

      {items.map((item) => (
        <Paper
          key={item.id}
          elevation={0}
          sx={{
            p: 2,
            mb: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 4,
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {item.name}
              </Typography>
              {item.customizations.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {item.customizations.map((c, i) => (
                    <Chip
                      key={i}
                      label={`${c.action === 'REMOVE' ? 'Без: ' : '+'}${c.ingredientName}${c.priceDelta ? ` +${c.priceDelta}₽` : ''}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 24 }}
                    />
                  ))}
                </Box>
              )}
            </Box>
            <IconButton size="small" onClick={() => removeItem(item.id)} color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                size="small"
                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                sx={{ border: '1px solid', borderColor: 'divider', width: 32, height: 32 }}
              >
                <RemoveIcon fontSize="small" />
              </IconButton>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 24, textAlign: 'center' }}>
                {item.quantity}
              </Typography>
              <IconButton
                size="small"
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                sx={{ border: '1px solid', borderColor: 'divider', width: 32, height: 32 }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {getItemPrice(item)} ₽
            </Typography>
          </Box>
        </Paper>
      ))}

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h3">Итого</Typography>
        <Typography variant="h3">{getTotalPrice()} ₽</Typography>
      </Box>

      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={() => router.push('/checkout')}
        sx={{ py: 1.5 }}
      >
        Оформить заказ
      </Button>
    </Container>
  );
}
