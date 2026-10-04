"""Import source DOCX without guessing missing quantities or cooking parameters.

Run with the bundled Python runtime (python-docx required):
  python scripts/import-kitchen-cards.py docs/technical_cards_belok.docx
The JSON is a fallback only; reimport never overwrites saved admin edits.
"""
import json
import re
import sys
from pathlib import Path
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/technical_cards_belok.docx'
document = Document(source)
cards = []
number = ''
title = ''

def category(n):
    if n in [1, 2, 3, 4, 14, 17]: return 'Соусы и смеси'
    if n in [5, 6, 7, 8]: return 'Десерты'
    if n in [11, 12, 13, 15, 16, 23]: return 'Заготовки'
    if n in [18, 19, 20]: return 'Гарниры'
    if n in [25, 26, 27, 28, 29]: return 'Супы'
    if n == 30: return 'Напитки'
    return 'Блюда'

def make_card(n, name, rows, process, suffix=''):
    ingredients = []
    yields = []
    for values in rows:
        if not values[0]: continue
        if values[0].lower().startswith('итого'):
            amount = ' / '.join(v for v in values[1:4] if v)
            if amount: yields.append(values[0] + ': ' + amount)
        else:
            ingredients.append(dict(name=values[0], gross=values[1], net=values[2], output=values[3]))
    # Keep decimal values, abbreviations, and source wording intact.
    chunks = []
    for line in process.splitlines():
        line = line.strip()
        if not line: continue
        # These are alternative storage/serving conditions, not successive actions.
        if chunks and (chunks[-1].endswith(':') or line.startswith(('Или ', 'С холодильника', 'С морозильной', 'В морозильной', 'В течении'))):
            chunks[-1] += '\n' + line
        else:
            chunks.extend(s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[А-ЯЁA-Z])', line) if s.strip())
    def step_title(text):
        lower = text.lower()
        if lower.startswith(('хран', 'срок')): return 'Хранение'
        if lower.startswith(('отпуск', 'подав', 'пода', 'отда')): return 'Подача'
        if lower.startswith(('расфас', 'упаков', 'в упаков', 'завак', 'замор')): return 'Упаковка и хранение'
        if lower.startswith(('остуд', 'после')): return 'После приготовления'
        if lower.startswith(('в микров', 'приготовление в', 'выпек', 'в су-вид', 'догот')): return 'Приготовление'
        if lower.startswith(('смеш', 'соедин', 'все ингредиенты')): return 'Смешайте ингредиенты'
        if lower.startswith(('пробить', 'перебить', 'погрузить')): return 'Измельчите в блендере'
        if lower.startswith(('перелить', 'разлить')): return 'Разлейте по ёмкостям'
        if lower.startswith(('выложить', 'разложить', 'распредел')): return 'Распределите по формам'
        if lower.startswith(('обжарить', 'отварить', 'сварить', 'проварить')): return 'Приготовьте ингредиенты'
        return 'Следуйте инструкции'
    steps = [dict(id=f'step-{i+1}', title=step_title(s), text=s, imageUrl='', timerSeconds=0) for i, s in enumerate(chunks)]
    assert ' '.join(' '.join(s['text'] for s in steps).split()) == ' '.join(process.split()), f'Process text lost in card {n}'
    notes = []
    if not process.strip(): notes.append('В исходнике отсутствует процесс приготовления. Заполните шаги перед публикацией.')
    if any(not any(row[k] for k in ('gross', 'net', 'output')) for row in ingredients):
        notes.append('В исходнике есть ингредиенты без количества. Уточните граммовки у ответственного за техкарту.')
    if n == 13: notes.append('Время су-вида записано как «1.10». Уточните длительность перед публикацией.')
    if n == 16: notes.append('В исходнике не указана температура су-вида. Уточните режим перед публикацией.')
    if n == 19: notes.append('Раздел «ЗАПЕЧЕН» в исходнике пуст. Дополните процесс или выделите пюре в отдельную карту.')
    if n == 22: notes.append('Уточните формулировку исходника «Сыр расплавить на разогретой микроволновке».')
    if n in [21, 22, 24]: notes.append('Состав содержит варианты и дополнения. Выберите состав нужного блюда; не используйте все варианты одновременно.')
    if n == 24: notes.append('В исходнике перечислены сочетания гарниров и соусов, а пошаговый процесс отсутствует. Заполните процесс перед публикацией.')
    return dict(id=f'belok-{n}{suffix}', sourceNumber=str(n), title=name, category=category(n),
                yieldText='; '.join(yields), notes='\n'.join(notes), sourceText=process.strip(),
                published=bool(steps) and n not in [13, 16, 19, 24], version=1, ingredients=ingredients, steps=steps)

for element in document.element.body:
    if element.tag.endswith('}p'):
        text = Paragraph(element, document).text.strip()
        if text.startswith('Технологическая карта'):
            match = re.search(r'№\s*(\d+)', text)
            number = int(match.group(1)) if match else None
            title = ''
        elif text.startswith('Наименование блюда'):
            title = text.split('(изделия)', 1)[-1].strip()
    elif element.tag.endswith('}tbl') and number and title:
        rows = [[c.text.strip() for c in r.cells] for r in Table(element, document).rows[1:]]
        # Some source tables have an extra empty column before the process.
        process = '\n'.join(dict.fromkeys(r[-1] for r in rows if r[-1]))
        if number == 30:
            # The four drinks are alternatives, not one recipe with all spirits.
            starts = [i for i, r in enumerate(rows) if r[0] in ['Апероль спритс', 'Американо', 'Джин тоник', 'Пинна-колада']]
            for k, start in enumerate(starts):
                end = starts[k+1] if k+1 < len(starts) else len(rows)
                drink_rows = rows[start+1:end]
                instruction = rows[start][-1]
                card = make_card(number, rows[start][0], drink_rows, instruction, f'-{k+1}')
                card['yieldText'] = rows[start][3]
                cards.append(card)
        else:
            cards.append(make_card(number, title, rows, process))

assert len(cards) == 33, f'Unexpected source card count: {len(cards)}'
destination = ROOT / 'src/data/kitchen-cards.json'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Imported {len(cards)} cards; {sum(not c["published"] for c in cards)} drafts')
