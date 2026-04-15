'use client';

import { Box, Typography, Paper, Grid, Skeleton } from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PeopleIcon from '@mui/icons-material/People';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { useQuery } from '@tanstack/react-query';

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

export default function AdminDashboard() {
  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => fetch('/api/admin/orders').then((r) => r.json()),
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => fetch('/api/admin/users').then((r) => r.json()),
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });

  const orders = ordersData?.orders ?? [];
  const users = usersData?.users ?? [];
  const products = productsData?.products ?? [];

  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (o: { createdAt: string }) => new Date(o.createdAt).toDateString() === today
  );
  const todayRevenue = todayOrders.reduce((s: number, o: { total: number }) => s + o.total, 0);

  const isLoading = loadingOrders || loadingUsers || loadingProducts;

  const stats: StatCard[] = [
    { label: 'Заказов сегодня', value: todayOrders.length, icon: <ReceiptIcon sx={{ fontSize: 40 }} /> },
    { label: 'Выручка сегодня', value: `${todayRevenue} ₽`, icon: <AttachMoneyIcon sx={{ fontSize: 40 }} /> },
    { label: 'Всего пользователей', value: users.length, icon: <PeopleIcon sx={{ fontSize: 40 }} /> },
    { label: 'Товаров в меню', value: products.length, icon: <RestaurantIcon sx={{ fontSize: 40 }} /> },
  ];

  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 3 }}>Дашборд</Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, i) => (
          <Grid key={i} size={{ xs: 6, md: 3 }}>
            {isLoading ? (
              <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
            ) : (
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  textAlign: 'center',
                }}
              >
                <Box sx={{ color: 'primary.main', mb: 1 }}>{stat.icon}</Box>
                <Typography variant="h3">{stat.value}</Typography>
                <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
              </Paper>
            )}
          </Grid>
        ))}
      </Grid>

      {/* Recent orders */}
      <Typography variant="h3" sx={{ mb: 2 }}>Последние заказы</Typography>
      {orders.slice(0, 5).map((order: {
        id: string;
        status: string;
        total: number;
        createdAt: string;
        user: { phone: string; name: string | null };
      }) => (
        <Paper
          key={order.id}
          elevation={0}
          sx={{ p: 2, mb: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                #{order.id.slice(0, 8)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {order.user?.name || order.user?.phone} · {new Date(order.createdAt).toLocaleString('ru')}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{order.total} ₽</Typography>
              <Typography variant="caption" color="text.secondary">{order.status}</Typography>
            </Box>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
