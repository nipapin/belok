'use client';

import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Select, MenuItem, Chip,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const statusLabels: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error' }> = {
  PENDING: { label: 'Ожидает', color: 'default' },
  CONFIRMED: { label: 'Подтверждён', color: 'info' },
  PREPARING: { label: 'Готовится', color: 'warning' },
  READY: { label: 'Готов', color: 'success' },
  COMPLETED: { label: 'Выполнен', color: 'success' },
  CANCELLED: { label: 'Отменён', color: 'error' },
};

interface Order {
  id: string;
  status: string;
  total: number;
  bonusUsed: number;
  discountAmount: number;
  paymentStatus: string;
  createdAt: string;
  user: { phone: string; name: string | null };
  items: { product: { name: string }; quantity: number; unitPrice: number }[];
}

export default function AdminOrdersPage() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => fetch('/api/admin/orders').then((r) => r.json()),
  });
  const orders: Order[] = data?.orders ?? [];

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/admin/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
  });

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 3 }}>Заказы</Typography>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Клиент</TableCell>
              <TableCell>Состав</TableCell>
              <TableCell>Сумма</TableCell>
              <TableCell>Оплата</TableCell>
              <TableCell>Дата</TableCell>
              <TableCell>Статус</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell sx={{ fontFamily: 'monospace' }}>
                  {order.id.slice(0, 8)}
                </TableCell>
                <TableCell>{order.user?.name || order.user?.phone}</TableCell>
                <TableCell>
                  {order.items.map((item, i) => (
                    <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                      {item.product.name} x{item.quantity}
                    </Typography>
                  ))}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{order.total} ₽</Typography>
                  {order.bonusUsed > 0 && (
                    <Typography variant="caption" color="warning.main">
                      Бонусы: -{order.bonusUsed}₽
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={order.paymentStatus === 'SUCCEEDED' ? 'Оплачен' : order.paymentStatus}
                    size="small"
                    color={order.paymentStatus === 'SUCCEEDED' ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="caption">
                    {new Date(order.createdAt).toLocaleString('ru')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={order.status}
                    onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value })}
                    sx={{ minWidth: 140 }}
                    renderValue={(v) => (
                      <Chip
                        label={statusLabels[v]?.label || v}
                        size="small"
                        color={statusLabels[v]?.color || 'default'}
                      />
                    )}
                  >
                    {Object.entries(statusLabels).map(([key, val]) => (
                      <MenuItem key={key} value={key}>{val.label}</MenuItem>
                    ))}
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
