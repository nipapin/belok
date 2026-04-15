'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Alert,
  InputAdornment,
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import LockIcon from '@mui/icons-material/Lock';
import { useAuthStore } from '@/store/authStore';

export default function AuthPage() {
  return (
    <Suspense>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { setUser } = useAuthStore();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+7');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [devCode, setDevCode] = useState('');

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      if (data.code) setDevCode(data.code);
      setStep('code');
      setCountdown(60);
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setUser(data.user);
      window.location.href = redirect;
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 1) return '+7';
    return '+7' + digits.slice(1, 11);
  };

  return (
    <Container maxWidth="sm" sx={{ pt: 8, pb: 4 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography
          variant="h1"
          sx={{ fontSize: '2.5rem', fontWeight: 800, mb: 1 }}
        >
          Белок
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Кафе здорового питания
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 4,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {step === 'phone' ? (
          <>
            <Typography variant="h3" sx={{ mb: 3 }}>
              Вход по номеру телефона
            </Typography>
            <TextField
              fullWidth
              label="Номер телефона"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="+7 (___) ___-__-__"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneIcon />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ mb: 3 }}
            />
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleSendCode}
              disabled={loading || phone.length < 12}
            >
              {loading ? <CircularProgress size={24} /> : 'Получить код'}
            </Button>
          </>
        ) : (
          <>
            <Typography variant="h3" sx={{ mb: 1 }}>
              Введите код
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Код отправлен на {phone}
            </Typography>
            {devCode && (
              <Alert severity="info" sx={{ mb: 2 }}>
                DEV: код — {devCode}
              </Alert>
            )}
            <TextField
              fullWidth
              label="Код из SMS"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                },
                htmlInput: { inputMode: 'numeric', maxLength: 4 },
              }}
              sx={{ mb: 3 }}
            />
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleVerifyCode}
              disabled={loading || code.length < 4}
              sx={{ mb: 2 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Подтвердить'}
            </Button>
            <Button
              fullWidth
              variant="text"
              onClick={() => {
                if (countdown === 0) {
                  handleSendCode();
                }
              }}
              disabled={countdown > 0}
            >
              {countdown > 0 ? `Повторно через ${countdown}с` : 'Отправить код повторно'}
            </Button>
            <Button
              fullWidth
              variant="text"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError('');
              }}
              sx={{ mt: 1 }}
            >
              Изменить номер
            </Button>
          </>
        )}
      </Paper>
    </Container>
  );
}
