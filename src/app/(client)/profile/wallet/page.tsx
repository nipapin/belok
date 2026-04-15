'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Button, Paper, Alert, CircularProgress,
} from '@mui/material';
import AppleIcon from '@mui/icons-material/Apple';
import AndroidIcon from '@mui/icons-material/Android';
import { useAuthStore } from '@/store/authStore';

export default function WalletPage() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState('');

  const handleAppleWallet = async () => {
    setLoading('apple');
    setError('');
    try {
      const res = await fetch('/api/wallet/apple');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      alert('Для полноценной работы Apple Wallet требуются сертификаты Apple Developer. Структура карты готова.');
    } catch {
      setError('Ошибка получения карты');
    } finally {
      setLoading(null);
    }
  };

  const handleGoogleWallet = async () => {
    setLoading('google');
    setError('');
    try {
      const res = await fetch('/api/wallet/google');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      window.open(data.link, '_blank');
    } catch {
      setError('Ошибка получения ссылки');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ pt: 2, pb: 2 }}>
      <Typography variant="h2" sx={{ mb: 2 }}>Карта в Wallet</Typography>

      {/* Preview card */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 4,
          background: 'linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 50%, #1A1A1A 100%)',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box sx={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
        }} />
        <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 2, mb: 3 }}>
          БЕЛОК
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.6 }}>БОНУСЫ</Typography>
            <Typography variant="h3" sx={{ fontWeight: 700 }}>
              {Math.floor(user?.bonusBalance || 0)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ opacity: 0.6 }}>УРОВЕНЬ</Typography>
            <Typography variant="h3" sx={{ fontWeight: 700 }}>
              {user?.loyaltyLevel?.name || 'Бронза'}
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" sx={{ opacity: 0.6 }}>
          {user?.name || 'Гость'} · {user?.phone}
        </Typography>
      </Paper>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
        Добавьте карту лояльности в Wallet для быстрого доступа к бонусам
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          startIcon={loading === 'apple' ? <CircularProgress size={20} color="inherit" /> : <AppleIcon />}
          onClick={handleAppleWallet}
          disabled={loading !== null}
          sx={{
            bgcolor: '#000',
            '&:hover': { bgcolor: '#333' },
            py: 1.5,
          }}
        >
          Добавить в Apple Wallet
        </Button>

        <Button
          fullWidth
          variant="contained"
          size="large"
          startIcon={loading === 'google' ? <CircularProgress size={20} color="inherit" /> : <AndroidIcon />}
          onClick={handleGoogleWallet}
          disabled={loading !== null}
          sx={{
            bgcolor: '#4285F4',
            '&:hover': { bgcolor: '#3367D6' },
            py: 1.5,
          }}
        >
          Добавить в Google Wallet
        </Button>
      </Box>
    </Container>
  );
}
