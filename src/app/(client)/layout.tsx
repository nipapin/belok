'use client';

import { Box } from '@mui/material';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import { useAuthStore } from '@/store/authStore';
import { useEffect } from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Header />
      <Box
        component="main"
        sx={{
          flex: 1,
          pb: 'calc(100px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </Box>
      <BottomNav />
    </Box>
  );
}
