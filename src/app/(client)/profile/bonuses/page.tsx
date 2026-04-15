'use client';

import {
  Box, Container, Typography, Paper, Chip, Skeleton,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useQuery } from '@tanstack/react-query';

interface BonusTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export default function BonusesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['bonuses'],
    queryFn: () => fetch('/api/bonuses').then((r) => r.json()),
  });

  const transactions: BonusTransaction[] = data?.transactions ?? [];
  const balance: number = data?.balance ?? 0;

  return (
    <Container maxWidth="sm" sx={{ pt: 2, pb: 2 }}>
      <Typography variant="h2" sx={{ mb: 2 }}>Детализация бонусов</Typography>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          textAlign: 'center',
          background: 'linear-gradient(135deg, #1A1A1A 0%, #333333 100%)',
          color: 'white',
        }}
      >
        <Typography variant="body2" sx={{ opacity: 0.7, mb: 0.5 }}>Баланс</Typography>
        <Typography variant="h1" sx={{ fontSize: '2.5rem', fontWeight: 800 }}>
          {Math.floor(balance)} бонусов
        </Typography>
      </Paper>

      <Typography variant="h4" sx={{ mb: 1.5 }}>История операций</Typography>

      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={70} sx={{ mb: 1, borderRadius: 2 }} />
          ))
        : transactions.length === 0
        ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            Пока нет операций
          </Typography>
        )
        : transactions.map((tx) => (
            <Paper
              key={tx.id}
              elevation={0}
              sx={{
                p: 2,
                mb: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {tx.amount > 0 ? (
                  <ArrowUpwardIcon color="success" fontSize="small" />
                ) : (
                  <ArrowDownwardIcon color="error" fontSize="small" />
                )}
                <Box>
                  <Typography variant="body2">{tx.description || tx.type}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(tx.createdAt).toLocaleString('ru')}
                  </Typography>
                </Box>
              </Box>
              <Chip
                label={`${tx.amount > 0 ? '+' : ''}${tx.amount}`}
                size="small"
                color={tx.amount > 0 ? 'success' : 'error'}
                variant="outlined"
              />
            </Paper>
          ))}
    </Container>
  );
}
