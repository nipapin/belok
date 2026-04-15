'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PersonIcon from '@mui/icons-material/Person';

const navItems = [
  { label: 'Главная', icon: HomeIcon, path: '/' },
  { label: 'Меню', icon: RestaurantMenuIcon, path: '/menu' },
  { label: 'Корзина', icon: ShoppingCartIcon, path: '/cart' },
  { label: 'Профиль', icon: PersonIcon, path: '/profile' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname.startsWith('/admin')) return null;

  const currentValue = navItems.findIndex((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
  );

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1200,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        pb: 'max(12px, env(safe-area-inset-bottom, 0px))',
        px: 2,
      }}
    >
      <Box
        role="navigation"
        aria-label="Основная навигация"
        sx={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 0.5,
          width: '100%',
          maxWidth: 400,
          px: 1,
          py: 0.75,
          bgcolor: '#1A1A1A',
          borderRadius: 9999,
          boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
        }}
      >
        {navItems.map((item, index) => {
          const selected = currentValue === index;
          const Icon = item.icon;
          return (
            <Box
              key={item.path}
              component="button"
              type="button"
              onClick={() => router.push(item.path)}
              sx={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                cursor: 'pointer',
                bgcolor: selected ? '#FFFFFF' : 'transparent',
                color: selected ? '#1A1A1A' : 'rgba(255,255,255,0.55)',
                borderRadius: 9999,
                py: 0.75,
                px: 0.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.25,
                transition: 'background-color 0.2s, color 0.2s',
                font: 'inherit',
                '&:hover': {
                  color: selected ? '#1A1A1A' : 'rgba(255,255,255,0.85)',
                },
              }}
            >
              <Icon sx={{ fontSize: 22 }} />
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: selected ? 600 : 500,
                  lineHeight: 1,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
