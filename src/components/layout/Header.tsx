'use client';

import { AppBar, Toolbar, Typography, IconButton, Badge, Box } from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';

export default function Header() {
  const router = useRouter();
  const totalItems = useCartStore((s) => s.getTotalItems());

  return (
    <AppBar position="sticky" elevation={0} color="transparent">
      <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 0, sm: 1 }, py: 0.5 }}>
        <Box
          onClick={() => router.push('/')}
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.02em',
              fontSize: '1.35rem',
              color: 'text.primary',
            }}
          >
            БЕЛОК
          </Typography>
        </Box>
        <IconButton
          onClick={() => router.push('/cart')}
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            border: '1px solid',
            borderColor: 'divider',
            '&:hover': { bgcolor: 'grey.50' },
          }}
        >
          <Badge badgeContent={totalItems} color="error">
            <ShoppingCartIcon />
          </Badge>
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
