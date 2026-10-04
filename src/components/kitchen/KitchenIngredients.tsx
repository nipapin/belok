import type { KitchenCard } from '@/lib/kitchen';

export default function KitchenIngredients({ card }: { card: KitchenCard }) {
  return <div className="kitchen-ingredients">
    <div className="kitchen-table-wrap"><table>
      <caption>Состав по техкарте · масса в граммах, если не указано другое</caption>
      <thead><tr><th scope="col">Ингредиент</th><th scope="col">Брутто</th><th scope="col">Нетто</th><th scope="col">Готовый продукт</th></tr></thead>
      <tbody>{card.ingredients.map((item, i) => <tr key={i}>
        <th scope="row">{item.name}</th><td>{item.gross || '—'}</td><td>{item.net || '—'}</td><td>{item.output || '—'}</td>
      </tr>)}</tbody>
    </table></div>
    {card.yieldText && <p className="kitchen-yield">Выход · {card.yieldText}</p>}
    {card.notes && <p className="kitchen-note">{card.notes}</p>}
  </div>;
}
