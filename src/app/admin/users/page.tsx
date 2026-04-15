'use client';

import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, TextField, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  bonusBalance: number;
  totalSpent: number;
  loyaltyLevel: { id: string; name: string } | null;
  _count: { orders: number };
  createdAt: string;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [editUser, setEditUser] = useState<User | null>(null);
  const [bonusAdjustment, setBonusAdjustment] = useState('');
  const [bonusReason, setBonusReason] = useState('');

  const { data } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => fetch('/api/admin/users').then((r) => r.json()),
  });
  const users: User[] = data?.users ?? [];

  const { data: levelsData } = useQuery({
    queryKey: ['admin-levels'],
    queryFn: () => fetch('/api/admin/settings').then((r) => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/users/${editUser?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditUser(null);
    },
  });

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 3 }}>Пользователи</Typography>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Телефон</TableCell>
              <TableCell>Имя</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Уровень</TableCell>
              <TableCell>Бонусы</TableCell>
              <TableCell>Потрачено</TableCell>
              <TableCell>Заказы</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.phone}</TableCell>
                <TableCell>{user.name || '—'}</TableCell>
                <TableCell>
                  <Chip label={user.role} size="small" color={user.role === 'ADMIN' ? 'error' : 'default'} />
                </TableCell>
                <TableCell>{user.loyaltyLevel?.name || '—'}</TableCell>
                <TableCell>{user.bonusBalance}</TableCell>
                <TableCell>{user.totalSpent} ₽</TableCell>
                <TableCell>{user._count.orders}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => {
                    setEditUser(user);
                    setBonusAdjustment('');
                    setBonusReason('');
                  }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!editUser} onClose={() => setEditUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Редактировать пользователя</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography variant="body2">Телефон: {editUser?.phone}</Typography>
            <FormControl fullWidth>
              <InputLabel>Роль</InputLabel>
              <Select
                value={editUser?.role || 'USER'}
                label="Роль"
                onChange={(e) => setEditUser(editUser ? { ...editUser, role: e.target.value } : null)}
              >
                <MenuItem value="USER">Пользователь</MenuItem>
                <MenuItem value="ADMIN">Администратор</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Корректировка бонусов (+/-)"
              type="number"
              value={bonusAdjustment}
              onChange={(e) => setBonusAdjustment(e.target.value)}
              helperText={`Текущий баланс: ${editUser?.bonusBalance}`}
            />
            {bonusAdjustment && (
              <TextField
                label="Причина"
                value={bonusReason}
                onChange={(e) => setBonusReason(e.target.value)}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditUser(null)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => {
              const body: Record<string, unknown> = { role: editUser?.role };
              if (bonusAdjustment) {
                const adj = parseFloat(bonusAdjustment);
                body.bonusBalance = (editUser?.bonusBalance || 0) + adj;
                body.bonusAdjustment = adj;
                body.bonusReason = bonusReason;
              }
              updateMutation.mutate(body);
            }}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
