'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  Chip,
  Switch,
  Divider,
  IconButton,
  Skeleton,
  Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useQuery } from '@tanstack/react-query';
import { useCartStore, type CartItemCustomization } from '@/store/cartStore';

interface ProductIngredient {
  id: string;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
  ingredient: {
    id: string;
    name: string;
    price: number;
  };
}

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
  category: { name: string };
  ingredients: ProductIngredient[];
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  const [quantity, setQuantity] = useState(1);
  const [removedIngredients, setRemovedIngredients] = useState<Set<string>>(new Set());
  const [addedExtras, setAddedExtras] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetch(`/api/products/${id}`).then((r) => r.json()),
  });

  const product: Product | undefined = data?.product;

  const toggleRemove = (ingredientId: string) => {
    setRemovedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  };

  const toggleExtra = (ingredientId: string) => {
    setAddedExtras((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  };

  const getCustomizations = (): CartItemCustomization[] => {
    if (!product) return [];
    const customizations: CartItemCustomization[] = [];

    for (const pi of product.ingredients) {
      if (pi.isDefault && pi.isRemovable && removedIngredients.has(pi.ingredient.id)) {
        customizations.push({
          ingredientId: pi.ingredient.id,
          ingredientName: pi.ingredient.name,
          action: 'REMOVE',
          priceDelta: 0,
        });
      }
      if (pi.isExtra && addedExtras.has(pi.ingredient.id)) {
        customizations.push({
          ingredientId: pi.ingredient.id,
          ingredientName: pi.ingredient.name,
          action: 'ADD',
          priceDelta: pi.ingredient.price,
        });
      }
    }
    return customizations;
  };

  const calcPrice = () => {
    if (!product) return 0;
    const extras = getCustomizations().reduce((s, c) => s + c.priceDelta, 0);
    return (product.price + extras) * quantity;
  };

  const handleAddToCart = () => {
    if (!product) return;
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      basePrice: product.price,
      quantity,
      customizations: getCustomizations(),
    });
    router.push('/cart');
  };

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ pt: 2 }}>
        <Skeleton variant="rounded" height={250} sx={{ borderRadius: 3, mb: 2 }} />
        <Skeleton width="60%" height={40} />
        <Skeleton width="40%" />
        <Skeleton width="100%" height={100} sx={{ mt: 2 }} />
      </Container>
    );
  }

  if (!product) {
    return (
      <Container maxWidth="sm" sx={{ pt: 4, textAlign: 'center' }}>
        <Typography variant="h3">Товар не найден</Typography>
        <Button onClick={() => router.push('/menu')} sx={{ mt: 2 }}>
          Вернуться в меню
        </Button>
      </Container>
    );
  }

  const defaultIngredients = product.ingredients.filter((pi) => pi.isDefault);
  const extraIngredients = product.ingredients.filter((pi) => pi.isExtra);

  return (
    <Box>
      {/* Image */}
      <Box sx={{ position: 'relative' }}>
        <Box
          sx={{
            height: 280,
            bgcolor: '#F0F0F0',
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
            <Typography variant="h1" color="text.secondary" sx={{ opacity: 0.15, fontSize: '6rem' }}>
              {product.name[0]}
            </Typography>
          )}
        </Box>
        <IconButton
          onClick={() => router.back()}
          sx={{
            position: 'absolute',
            top: 12,
            left: 12,
            bgcolor: 'white',
            boxShadow: 2,
            '&:hover': { bgcolor: '#F5F5F5' },
          }}
        >
          <ArrowBackIcon />
        </IconButton>
      </Box>

      <Container maxWidth="sm" sx={{ pt: 2, pb: 2 }}>
        {/* Title & Price */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Chip label={product.category.name} size="small" sx={{ mb: 1 }} />
            <Typography variant="h2">{product.name}</Typography>
          </Box>
          <Typography variant="h2" color="primary">
            {product.price} ₽
          </Typography>
        </Box>

        {product.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {product.description}
          </Typography>
        )}

        {/* КБЖУ */}
        {product.calories && (
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              p: 2,
              bgcolor: '#F8F8F8',
              borderRadius: 3,
              mb: 3,
              justifyContent: 'space-around',
            }}
          >
            {[
              { label: 'Ккал', value: product.calories },
              { label: 'Белки', value: product.proteins },
              { label: 'Жиры', value: product.fats },
              { label: 'Углеводы', value: product.carbs },
            ].map((item) => (
              <Box key={item.label} sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontSize: '1.1rem' }}>{item.value}</Typography>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Default ingredients - removable */}
        {defaultIngredients.length > 0 && (
          <>
            <Typography variant="h4" sx={{ mb: 1.5 }}>Состав</Typography>
            {defaultIngredients.map((pi) => (
              <Box
                key={pi.id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    textDecoration: removedIngredients.has(pi.ingredient.id)
                      ? 'line-through'
                      : 'none',
                    color: removedIngredients.has(pi.ingredient.id)
                      ? 'text.secondary'
                      : 'text.primary',
                  }}
                >
                  {pi.ingredient.name}
                </Typography>
                {pi.isRemovable && (
                  <Switch
                    checked={!removedIngredients.has(pi.ingredient.id)}
                    onChange={() => toggleRemove(pi.ingredient.id)}
                    size="small"
                  />
                )}
              </Box>
            ))}
            <Divider sx={{ my: 2 }} />
          </>
        )}

        {/* Extra ingredients - addable */}
        {extraIngredients.length > 0 && (
          <>
            <Typography variant="h4" sx={{ mb: 1.5 }}>Добавить</Typography>
            {extraIngredients.map((pi) => (
              <Box
                key={pi.id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1,
                }}
              >
                <Box>
                  <Typography variant="body2">{pi.ingredient.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    +{pi.ingredient.price} ₽
                  </Typography>
                </Box>
                <Switch
                  checked={addedExtras.has(pi.ingredient.id)}
                  onChange={() => toggleExtra(pi.ingredient.id)}
                  size="small"
                />
              </Box>
            ))}
            <Divider sx={{ my: 2 }} />
          </>
        )}

        {/* Quantity */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, my: 3 }}>
          <IconButton
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            sx={{ border: '1px solid', borderColor: 'divider' }}
          >
            <RemoveIcon />
          </IconButton>
          <Typography variant="h3" sx={{ minWidth: 40, textAlign: 'center' }}>
            {quantity}
          </Typography>
          <IconButton
            onClick={() => setQuantity(quantity + 1)}
            sx={{ border: '1px solid', borderColor: 'divider' }}
          >
            <AddIcon />
          </IconButton>
        </Box>

        {/* Add to cart */}
        <Paper
          elevation={0}
          sx={{
            position: 'sticky',
            bottom: 80,
            p: 2,
            bgcolor: 'white',
            borderTop: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
          }}
        >
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleAddToCart}
            startIcon={<ShoppingCartIcon />}
            sx={{ py: 1.5 }}
          >
            В корзину · {calcPrice()} ₽
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}
