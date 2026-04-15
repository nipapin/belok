'use client';

import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardMedia,
  CardContent,
  Grid,
  Chip,
  Skeleton,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  calories: number | null;
  proteins: number | null;
  category: { name: string };
}

interface Category {
  id: string;
  name: string;
  image: string | null;
  _count: { products: number };
}

export default function HomePage() {
  const router = useRouter();
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then((r) => r.json()),
  });

  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/products/categories').then((r) => r.json()),
  });

  const products: Product[] = productsData?.products?.slice(0, 4) ?? [];
  const categories: Category[] = categoriesData?.categories ?? [];

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
        <Box sx={{ pt: 2 }}>
          <Card
            sx={{
              textAlign: 'center',
              py: { xs: 4, sm: 5 },
              px: 3,
            }}
          >
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2rem', sm: '2.5rem' },
                fontWeight: 800,
                mb: 1,
                color: 'text.primary',
                letterSpacing: '-0.02em',
              }}
            >
              БЕЛОК
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 3, maxWidth: 400, mx: 'auto', lineHeight: 1.65 }}
            >
              Кафе здорового питания. Свежие боулы, смузи и салаты каждый день.
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={() => router.push('/menu')}
              endIcon={<ArrowForwardIcon />}
              sx={{ px: 4 }}
            >
              Смотреть меню
            </Button>
          </Card>
        </Box>

        <Container maxWidth="md" disableGutters sx={{ mt: 3 }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            Категории
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              overflowX: 'auto',
              pb: 2,
              mb: 3,
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {loadingCategories
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    variant="rounded"
                    width={120}
                    height={44}
                    sx={{ borderRadius: 9999, flexShrink: 0 }}
                  />
                ))
              : categories.map((cat) => (
                  <Chip
                    key={cat.id}
                    label={`${cat.name} (${cat._count.products})`}
                    onClick={() => router.push(`/menu?category=${cat.id}`)}
                    variant="outlined"
                    sx={{
                      height: 44,
                      fontSize: '0.9rem',
                      px: 1,
                      flexShrink: 0,
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      '&:hover': { bgcolor: 'grey.100' },
                    }}
                  />
                ))}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <LocalFireDepartmentIcon color="error" />
            <Typography variant="h2">Популярное</Typography>
          </Box>
          <Grid container spacing={2}>
            {loadingProducts
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Grid key={i} size={{ xs: 6, sm: 3 }}>
                    <Skeleton variant="rounded" height={220} sx={{ borderRadius: 4 }} />
                  </Grid>
                ))
              : products.map((product) => (
                  <Grid key={product.id} size={{ xs: 6, sm: 3 }}>
                    <Card
                      onClick={() => router.push(`/menu/${product.id}`)}
                      sx={{
                        cursor: 'pointer',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 0.2s',
                        '&:hover': { transform: 'translateY(-4px)' },
                      }}
                    >
                      <CardMedia
                        component="div"
                        sx={{
                          height: 140,
                          bgcolor: 'grey.100',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {product.image ? (
                          <Box
                            component="img"
                            src={product.image}
                            alt={product.name}
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <Typography variant="h3" color="text.secondary">
                            {product.name[0]}
                          </Typography>
                        )}
                      </CardMedia>
                      <CardContent sx={{ flex: 1, p: 1.5 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {product.name}
                        </Typography>
                        {product.calories && (
                          <Typography variant="caption" color="text.secondary">
                            {product.calories} ккал
                          </Typography>
                        )}
                        <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                          {product.price} ₽
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
          </Grid>

          <Box sx={{ textAlign: 'center', mt: 4, mb: 2 }}>
            <Button
              variant="outlined"
              size="large"
              onClick={() => router.push('/menu')}
              endIcon={<ArrowForwardIcon />}
            >
              Всё меню
            </Button>
          </Box>
        </Container>
      </Box>
      <BottomNav />
    </Box>
  );
}
