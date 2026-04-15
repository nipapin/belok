'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  TextField,
  Divider,
  Chip,
  LinearProgress,
  Alert,
  CircularProgress,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import StarIcon from '@mui/icons-material/Star';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuthStore } from '@/store/authStore';
import { useQuery } from '@tanstack/react-query';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, setUser, logout } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = '/auth?redirect=/profile';
    }
  }, [isLoading, user]);

  const { data: bonusData } = useQuery({
    queryKey: ['bonuses'],
    queryFn: () => fetch('/api/bonuses').then((r) => r.json()),
    enabled: !!user,
  });

  const levels = bonusData?.levels ?? [];
  const currentLevel = bonusData?.currentLevel;
  const nextLevel = levels.find(
    (l: { minSpent: number }) => l.minSpent > (user?.totalSpent || 0)
  );

  const progress = nextLevel
    ? ((user?.totalSpent || 0) / nextLevel.minSpent) * 100
    : 100;

  const handleSave = async () => {
    const res = await fetch('/api/auth/update-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (isLoading || !user) {
    return (
      <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ pt: 2, pb: 2 }}>
      {saved && <Alert severity="success" sx={{ mb: 2 }}>Профиль обновлён</Alert>}

      {/* User Info */}
      <Paper elevation={0} sx={{ p: 3, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <AccountCircleIcon sx={{ fontSize: 56, color: 'text.secondary' }} />
          <Box>
            <Typography variant="h3">{user.name || 'Гость'}</Typography>
            <Typography variant="body2" color="text.secondary">{user.phone}</Typography>
          </Box>
        </Box>

        {editing ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              size="small"
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" onClick={handleSave} size="small">
                Сохранить
              </Button>
              <Button variant="text" onClick={() => setEditing(false)} size="small">
                Отмена
              </Button>
            </Box>
          </Box>
        ) : (
          <Button variant="outlined" size="small" onClick={() => setEditing(true)}>
            Редактировать
          </Button>
        )}
      </Paper>

      {/* Loyalty Level */}
      <Paper elevation={0} sx={{ p: 3, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <StarIcon color="warning" />
          <Typography variant="h4">Программа лояльности</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Chip
            label={currentLevel?.name || 'Бронза'}
            color="primary"
            size="small"
          />
          {nextLevel && (
            <Typography variant="caption" color="text.secondary">
              До «{nextLevel.name}»: {Math.ceil(nextLevel.minSpent - (user.totalSpent || 0))} ₽
            </Typography>
          )}
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(progress, 100)}
          sx={{
            height: 8,
            borderRadius: 4,
            mb: 1.5,
            bgcolor: 'grey.100',
            '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 4 },
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            Кэшбэк: {currentLevel?.cashbackPercent || 3}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Скидка: {currentLevel?.discountPercent || 0}%
          </Typography>
        </Box>
      </Paper>

      {/* Bonus Balance */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 2,
          border: '1px solid',
          borderColor: 'success.light',
          borderRadius: 4,
          background: 'linear-gradient(160deg, #E8F5EE 0%, #FFFFFF 55%, #F4FAF6 100%)',
          color: 'text.primary',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'success.dark' }}>
          <CardGiftcardIcon />
          <Typography variant="h4">Бонусный баланс</Typography>
        </Box>
        <Typography variant="h1" sx={{ fontSize: '2.5rem', fontWeight: 800, color: 'success.dark' }}>
          {Math.floor(user.bonusBalance)}{' '}
          <Typography component="span" variant="body1" color="text.secondary">
            бонусов
          </Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          1 бонус = 1 ₽ · Оплата до 30% заказа
        </Typography>
      </Paper>

      {/* Menu items */}
      <Divider sx={{ my: 2 }} />

      {[
        { label: 'История заказов', icon: <ReceiptLongIcon />, path: '/orders' },
        { label: 'Детализация бонусов', icon: <CardGiftcardIcon />, path: '/profile/bonuses' },
        { label: 'Карта в Wallet', icon: <AccountBalanceWalletIcon />, path: '/profile/wallet' },
      ].map((item) => (
        <Paper
          key={item.path}
          elevation={0}
          onClick={() => router.push(item.path)}
          sx={{
            p: 2,
            mb: 1,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'grey.100' },
          }}
        >
          {item.icon}
          <Typography variant="body1">{item.label}</Typography>
        </Paper>
      ))}

      <Button
        fullWidth
        variant="outlined"
        color="error"
        startIcon={<LogoutIcon />}
        onClick={handleLogout}
        sx={{ mt: 3 }}
      >
        Выйти
      </Button>
    </Container>
  );
}
