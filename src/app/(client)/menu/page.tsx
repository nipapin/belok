'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Skeleton,
  Grid,
  TextField,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  categoryId: string;
  category: { id: string; name: string };
}

interface Category {
  id: string;
  name: string;
  _count: { products: number };
}

export default function MenuPage() {
  return (
    <Suspense>
      <MenuPageInner />
    </Suspense>
  );
}

function MenuPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    searchParams.get('category')
  );
  const [search, setSearch] = useState('');

  const { data: categoriesData, isLoading: loadingCats } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/products/categories').then((r) => r.json()),
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then((r) => r.json()),
  });

  const categories: Category[] = categoriesData?.categories ?? [];
  const allProducts: Product[] = productsData?.products ?? [];

  const filteredProducts = allProducts.filter((p) => {
    const matchesCategory = !selectedCategory || p.categoryId === selectedCategory;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <Container maxWidth="md" sx={{ pt: 2, pb: 2 }}>
      {/* Search */}
      <TextField
        fullWidth
        placeholder="Поиск по меню..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="disabled" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 2 }}
        size="small"
      />

      {/* Category chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          pb: 2,
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <Chip
          label="Все"
          variant={!selectedCategory ? 'filled' : 'outlined'}
          onClick={() => setSelectedCategory(null)}
          sx={{
            flexShrink: 0,
            bgcolor: !selectedCategory ? 'primary.main' : undefined,
            color: !selectedCategory ? 'white' : undefined,
          }}
        />
        {loadingCats
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" width={100} height={32} sx={{ borderRadius: 9999, flexShrink: 0 }} />
            ))
          : categories.map((cat) => (
              <Chip
                key={cat.id}
                label={cat.name}
                variant={selectedCategory === cat.id ? 'filled' : 'outlined'}
                onClick={() => setSelectedCategory(cat.id)}
                sx={{
                  flexShrink: 0,
                  bgcolor: selectedCategory === cat.id ? 'primary.main' : undefined,
                  color: selectedCategory === cat.id ? 'white' : undefined,
                }}
              />
            ))}
      </Box>

      {/* Products grid */}
      <Grid container spacing={2}>
        {loadingProducts
          ? Array.from({ length: 6 }).map((_, i) => (
              <Grid key={i} size={{ xs: 6, sm: 4 }}>
                <Skeleton variant="rounded" height={240} sx={{ borderRadius: 4 }} />
              </Grid>
            ))
          : filteredProducts.map((product) => (
              <Grid key={product.id} size={{ xs: 6, sm: 4 }}>
                <Card
                  onClick={() => router.push(`/menu/${product.id}`)}
                  sx={{
                    cursor: 'pointer',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.2s',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                  }}
                >
                  <CardMedia
                    component="div"
                    sx={{
                      height: 150,
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
                      <Typography variant="h2" color="text.secondary" sx={{ opacity: 0.3 }}>
                        {product.name[0]}
                      </Typography>
                    )}
                  </CardMedia>
                  <CardContent sx={{ flex: 1, p: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {product.name}
                    </Typography>
                    {product.calories && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {product.calories} ккал
                        </Typography>
                        {product.proteins && (
                          <Typography variant="caption" color="text.secondary">
                            · Б {product.proteins}
                          </Typography>
                        )}
                      </Box>
                    )}
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {product.price} ₽
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
      </Grid>

      {!loadingProducts && filteredProducts.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h3" color="text.secondary">
            Ничего не найдено
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Попробуйте изменить параметры поиска
          </Typography>
        </Box>
      )}
    </Container>
  );
}
