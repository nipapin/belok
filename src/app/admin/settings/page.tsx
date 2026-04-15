'use client';

import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface LoyaltyLevel {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discountPercent: number;
  _count?: { users: number };
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [levels, setLevels] = useState<LoyaltyLevel[]>([]);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => fetch('/api/admin/settings').then((r) => r.json()),
  });

  useEffect(() => {
    if (data?.levels) setLevels(data.levels);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const updateLevel = (index: number, field: string, value: string) => {
    setLevels((prev) => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 3 }}>Настройки бонусной программы</Typography>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>Настройки сохранены</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Уровень</TableCell>
              <TableCell>Мин. потрачено (₽)</TableCell>
              <TableCell>Кэшбэк (%)</TableCell>
              <TableCell>Скидка (%)</TableCell>
              <TableCell>Пользователей</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {levels.map((level, i) => (
              <TableRow key={level.id}>
                <TableCell>
                  <TextField
                    size="small"
                    value={level.name}
                    onChange={(e) => updateLevel(i, 'name', e.target.value)}
                    sx={{ width: 150 }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    type="number"
                    value={level.minSpent}
                    onChange={(e) => updateLevel(i, 'minSpent', e.target.value)}
                    sx={{ width: 120 }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    type="number"
                    value={level.cashbackPercent}
                    onChange={(e) => updateLevel(i, 'cashbackPercent', e.target.value)}
                    sx={{ width: 100 }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    type="number"
                    value={level.discountPercent}
                    onChange={(e) => updateLevel(i, 'discountPercent', e.target.value)}
                    sx={{ width: 100 }}
                  />
                </TableCell>
                <TableCell>{level._count?.users ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Button
        variant="contained"
        startIcon={<SaveIcon />}
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        Сохранить настройки
      </Button>

      <Paper elevation={0} sx={{ p: 3, mt: 4, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>Правила бонусной программы</Typography>
        <Typography variant="body2" color="text.secondary">
          1. Бонусами можно оплатить до 30% стоимости заказа.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          2. 1 бонус = 1 рубль.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          3. Кэшбэк начисляется после успешной оплаты.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          4. Уровень лояльности повышается автоматически при достижении суммы покупок.
        </Typography>
      </Paper>
    </Box>
  );
}
