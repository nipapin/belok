'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Chip,
  Alert,
  Checkbox,
  ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Ingredient {
  id: string;
  name: string;
  price: number;
}

interface ProductIngredient {
  ingredientId: string;
  ingredient: Ingredient;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  categoryId: string;
  isAvailable: boolean;
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  sortOrder: number;
  category: { id: string; name: string };
  ingredients: ProductIngredient[];
}

interface Category {
  id: string;
  name: string;
}

const emptyForm = {
  name: '', description: '', price: '', image: '', categoryId: '',
  isAvailable: true, calories: '', proteins: '', fats: '', carbs: '',
  sortOrder: 0, ingredientIds: [] as string[],
};

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const { data: productsData } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => fetch('/api/admin/categories').then((r) => r.json()),
  });

  const { data: ingredientsData } = useQuery({
    queryKey: ['admin-ingredients'],
    queryFn: () => fetch('/api/admin/ingredients').then((r) => r.json()),
  });

  const products: Product[] = productsData?.products ?? [];
  const categories: Category[] = categoriesData?.categories ?? [];
  const ingredients: Ingredient[] = ingredientsData?.ingredients ?? [];

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { image?: string }) => {
      let imageUrl = data.image || editing?.image || '';

      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
        const uploadData = await uploadRes.json();
        if (uploadRes.ok) imageUrl = uploadData.url;
      }

      const body = {
        ...data,
        image: imageUrl,
        ingredients: data.ingredientIds.map((id: string) => ({
          ingredientId: id,
          isDefault: true,
          isRemovable: true,
          isExtra: false,
        })),
      };

      const url = editing ? `/api/admin/products/${editing.id}` : '/api/admin/products';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      handleClose();
    },
    onError: () => setError('Ошибка сохранения'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/products/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
  });

  const handleOpen = (product?: Product) => {
    if (product) {
      setEditing(product);
      setForm({
        name: product.name,
        description: product.description || '',
        price: product.price.toString(),
        image: product.image || '',
        categoryId: product.categoryId,
        isAvailable: product.isAvailable,
        calories: product.calories?.toString() || '',
        proteins: product.proteins?.toString() || '',
        fats: product.fats?.toString() || '',
        carbs: product.carbs?.toString() || '',
        sortOrder: product.sortOrder,
        ingredientIds: product.ingredients.map((pi) => pi.ingredientId),
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
    }
    setImageFile(null);
    setError('');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setError('');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h2">Товары</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          Добавить
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Категория</TableCell>
              <TableCell>Цена</TableCell>
              <TableCell>Доступен</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {product.image && (
                      <Box
                        component="img"
                        src={product.image}
                        sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
                      />
                    )}
                    {product.name}
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip label={product.category.name} size="small" />
                </TableCell>
                <TableCell>{product.price} ₽</TableCell>
                <TableCell>
                  <Chip
                    label={product.isAvailable ? 'Да' : 'Нет'}
                    size="small"
                    color={product.isAvailable ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpen(product)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      if (confirm('Удалить товар?')) deleteMutation.mutate(product.id);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Product Dialog */}
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Редактировать товар' : 'Новый товар'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Название" required fullWidth
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label="Описание" multiline rows={2} fullWidth
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Цена (₽)" required type="number" sx={{ flex: 1 }}
                value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>Категория</InputLabel>
                <Select
                  value={form.categoryId} label="Категория"
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Ккал" type="number" sx={{ flex: 1 }}
                value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })}
              />
              <TextField
                label="Белки" type="number" sx={{ flex: 1 }}
                value={form.proteins} onChange={(e) => setForm({ ...form, proteins: e.target.value })}
              />
              <TextField
                label="Жиры" type="number" sx={{ flex: 1 }}
                value={form.fats} onChange={(e) => setForm({ ...form, fats: e.target.value })}
              />
              <TextField
                label="Углев." type="number" sx={{ flex: 1 }}
                value={form.carbs} onChange={(e) => setForm({ ...form, carbs: e.target.value })}
              />
            </Box>
            <FormControl fullWidth>
              <InputLabel>Ингредиенты</InputLabel>
              <Select
                multiple
                value={form.ingredientIds}
                onChange={(e) => setForm({ ...form, ingredientIds: e.target.value as string[] })}
                label="Ингредиенты"
                renderValue={(selected) =>
                  selected
                    .map((id) => ingredients.find((i) => i.id === id)?.name || id)
                    .join(', ')
                }
              >
                {ingredients.map((ing) => (
                  <MenuItem key={ing.id} value={ing.id}>
                    <Checkbox checked={form.ingredientIds.includes(ing.id)} />
                    <ListItemText primary={`${ing.name} (+${ing.price}₽)`} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>Изображение</Typography>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isAvailable}
                  onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
                />
              }
              label="Доступен для заказа"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => saveMutation.mutate(form)}
            disabled={!form.name || !form.price || !form.categoryId}
          >
            {editing ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
