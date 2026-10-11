'use client';

import { hasPermission } from '@/lib/roles';
import { useAuthStore } from '@/store/authStore';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Search, ArrowLeft, ChevronRight } from 'lucide-react';
import RecipeEditor from '@/components/admin/RecipeEditor';
import { fetchAdminJson } from '@/lib/adminDashboard';
import '../manager/manager.css';

type Recipe = { ownerId: string; ownerKind: 'PRODUCT' | 'PREPARED'; name: string; unit: 'g' | 'ml' | 'pcs'; recipeId: string | null; lineCount: number; outputQuantity: string | null; outputUnit: string | null };
export default function RecipesPage() {
  const user = useAuthStore(s=>s.user);
  const canCatalog = hasPermission(user,'inventory_catalog');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('ALL');
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const list = useQuery({ queryKey: ['admin-recipes'], queryFn: () => fetchAdminJson<{ recipes: Recipe[] }>('/api/admin/inventory/recipes'), refetchInterval: 15000 });
  const recipes = list.data?.recipes ?? [];
  const visible = recipes.filter(r => (kind === 'ALL' || kind === r.ownerKind) && (!missing || !r.recipeId) && r.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
  return <div className="manager-space">
    <header className="manager-heading"><div><p className="dashboard-eyebrow">МЕНЮ И ПРОИЗВОДСТВО</p><h1>Техкарты</h1><p>Состав, нормы расхода и выход каждого блюда и заготовки.</p></div><ClipboardList size={28} /></header>
    <div className="manager-note">Для стоп-листа укажите расход на одну порцию блюда (выход в шт.). Для заготовок укажите фактический выход в г, мл или шт. <Link href="/admin/inventory">Открыть склад →</Link></div>
    {selected ? <section className="manager-panel">
      <button className="manager-button" onClick={() => { setSelected(null); void list.refetch(); }}><ArrowLeft size={17} /> Все техкарты</button>
      <h2 className="mt-4 mb-4">{selected.name}</h2>
      <RecipeEditor key={`${selected.ownerKind}:${selected.ownerId}`} ownerKind={selected.ownerKind} ownerId={selected.ownerId} outputUnit={selected.unit} readOnly={!canCatalog} />
    </section> : <>
      <div className="manager-tools">
        <label><span>Поиск</span><div className="manager-search"><Search size={17} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Название блюда или заготовки" /></div></label>
        <label><span>Тип</span><select value={kind} onChange={e => setKind(e.target.value)}><option value="ALL">Все техкарты</option><option value="PRODUCT">Блюда</option><option value="PREPARED">Заготовки</option></select></label>
        <label className="manager-check"><input type="checkbox" checked={missing} onChange={e => setMissing(e.target.checked)} /> Без техкарты</label>
      </div>
      {list.isPending ? <p role="status">Загружаем техкарты…</p> : list.isError ? <div role="alert" className="manager-note">Не удалось загрузить техкарты. <button onClick={() => void list.refetch()}>Повторить</button></div> : <section className="manager-panel manager-list">
        <p className="manager-caption">{recipes.filter(r => r.recipeId).length} техкарт заполнено · {recipes.filter(r => !r.recipeId).length} без техкарты</p>
        {visible.map(recipe => <button key={`${recipe.ownerKind}:${recipe.ownerId}`} className="manager-list-row" onClick={() => setSelected(recipe)}>
          <span><strong>{recipe.name}</strong><small>{recipe.ownerKind === 'PRODUCT' ? 'Блюдо' : 'Заготовка'} · {recipe.recipeId ? `Компонентов: ${recipe.lineCount}` : 'Состав еще не задан'}</small></span>
          <span className={`manager-badge ${recipe.recipeId ? 'available' : 'unconfigured'}`}>{canCatalog ? recipe.recipeId ? 'Редактировать' : 'Создать ТТК' : 'Просмотр'}</span><ChevronRight size={17} />
        </button>)}
        {!visible.length && <div className="manager-empty"><ClipboardList size={30} /><h2>Техкарт по фильтру нет</h2><p>Добавьте блюдо в меню или заготовку на склад — здесь можно будет заполнить ее состав.</p><Link href="/admin/products/new" className="manager-button">Добавить блюдо</Link></div>}
      </section>}
    </>}
  </div>;
}
