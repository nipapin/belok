'use client';

import { useState } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Switch, FormControlLabel, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Ingredient {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  _count: { products: number };
}

export default function AdminIngredientsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState({ name: '', price: '0', isAvailable: true });

  const { data } = useQuery({
    queryKey: ['admin-ingredients'],
    queryFn: () => fetch('/api/admin/ingredients').then((r) => r.json()),
  });
  const ingredients: Ingredient[] = data?.ingredients ?? [];

  const saveMutation = useMutation({
    mutationFn: async (d: typeof form) => {
      const url = editing ? `/api/admin/ingredients/${editing.id}` : '/api/admin/ingredients';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ingredients'] });
      handleClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/ingredients/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ingredients'] }),
  });

  const handleOpen = (ing?: Ingredient) => {
    if (ing) {
      setEditing(ing);
      setForm({ name: ing.name, price: ing.price.toString(), isAvailable: ing.isAvailable });
    } else {
      setEditing(null);
      setForm({ name: '', price: '0', isAvailable: true });
    }
    setOpen(true);
  };

  const handleClose = () => { setOpen(false); setEditing(null); };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h2">Ингредиенты</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>Добавить</Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Цена</TableCell>
              <TableCell>Используется</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ingredients.map((ing) => (
              <TableRow key={ing.id}>
                <TableCell>{ing.name}</TableCell>
                <TableCell>{ing.price} ₽</TableCell>
                <TableCell>{ing._count.products} товаров</TableCell>
                <TableCell>
                  <Chip label={ing.isAvailable ? 'Доступен' : 'Недоступен'} size="small" color={ing.isAvailable ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpen(ing)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => {
                    if (confirm('Удалить?')) deleteMutation.mutate(ing.id);
                  }}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Редактировать' : 'Новый ингредиент'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField label="Название" fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField label="Цена (₽)" type="number" fullWidth value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <FormControlLabel control={<Switch checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} />} label="Доступен" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Отмена</Button>
          <Button variant="contained" onClick={() => saveMutation.mutate(form)} disabled={!form.name}>
            {editing ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
