'use client';

import { selectExtra, type OptionLink } from '@/lib/productOptions';

interface Props {
  links: OptionLink[];
  removed: Set<string>;
  added: Set<string>;
  onRemoved: (value: Set<string>) => void;
  onAdded: (value: Set<string>) => void;
}

export default function ProductOptions({ links, removed, added, onRemoved, onAdded }: Props) {
  const extras = links.filter((link) => link.isExtra && link.ingredient.isAvailable !== false);
  const groups = [...new Set(extras.map((link) => link.optionGroup).filter((group): group is string => Boolean(group)))].sort((a, b) => a.localeCompare(b, 'ru'));
  const defaults = links.filter((link) => link.isDefault && !groups.includes(link.optionGroup ?? ''));
  const toggleRemove = (id: string) => {
    const next = new Set(removed);
    if (next.has(id)) next.delete(id); else next.add(id);
    onRemoved(next);
  };
  return (
    <div className="mt-5 space-y-5">
      {groups.map((group) => {
        const base = links.find((link) => link.optionGroup === group && link.isDefault);
        const choices = extras.filter((link) => link.optionGroup === group);
        const selected = choices.find((link) => added.has(link.ingredient.id))?.ingredient.id ?? '';
        return (
          <label key={group} className="flex flex-col gap-2">
            <span className="text-base font-semibold">{group}</span>
            <select aria-label={group} className="select-pill w-full" value={selected} onChange={(event) => {
              const next = new Set(added);
              for (const choice of choices) next.delete(choice.ingredient.id);
              if (event.target.value) next.add(event.target.value);
              onAdded(next);
              if (base) { const keep = new Set(removed); keep.delete(base.ingredient.id); onRemoved(keep); }
            }}>
              <option value="">{base?.ingredient.name ?? 'Без добавки'} · +0 ₽</option>
              {choices.map(({ ingredient }) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} · +{ingredient.price} ₽</option>)}
            </select>
          </label>
        );
      })}
      {extras.some((link) => !link.optionGroup) ? (
        <fieldset className="min-w-0">
          <legend className="mb-2 text-base font-semibold">Добавить к заказу</legend>
          <div className="glass-panel divide-y divide-(--lg-ring) p-1">
            {extras.filter((link) => !link.optionGroup).map(({ ingredient }) => (
              <label key={ingredient.id} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-3">
                <span>{ingredient.name}<span className="ml-2 text-sm text-(--lg-text-muted)">+{ingredient.price} ₽</span></span>
                <input type="checkbox" className="size-5 accent-emerald-600" checked={added.has(ingredient.id)} onChange={() => onAdded(selectExtra(links, added, ingredient.id))} />
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {defaults.length ? (
        <fieldset className="min-w-0">
          <legend className="mb-2 text-base font-semibold">Состав</legend>
          <div className="glass-panel divide-y divide-(--lg-ring) p-1">
            {defaults.map(({ ingredient, isRemovable }) => (
              <label key={ingredient.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-3">
                <span className={removed.has(ingredient.id) ? 'line-through opacity-60' : ''}>{ingredient.name}</span>
                {isRemovable ? <input type="checkbox" className="size-5 accent-emerald-600" checked={!removed.has(ingredient.id)} onChange={() => toggleRemove(ingredient.id)} aria-label={`Оставить ${ingredient.name}`} /> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
