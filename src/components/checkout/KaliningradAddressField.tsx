'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Search, X } from 'lucide-react';
import type { Map as MapboxMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { isInKaliningrad, KALININGRAD_LNG_LAT, KALININGRAD_MAX_BOUNDS } from '@/lib/kaliningrad';

const inputClass =
  'w-full rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-4 py-3 text-sm text-(--lg-text) outline-none placeholder:text-(--lg-text-muted) focus:border-(--lg-ring-strong) focus:ring-2 focus:ring-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]';

type SuggestItem = { label: string; lat: number; lon: number };
type PickedPoint = { label: string; lat: number; lon: number };
type SavedAddress = PickedPoint & { id: string; name: string };

const MAP_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API_KEY?.trim() || 'pk.placeholder';

function installMapboxWorker(mapboxgl: { workerClass: typeof Worker | null }) {
  const workerUrl = new URL('mapbox-gl/dist/mapbox-gl-csp-worker.js', import.meta.url);
  mapboxgl.workerClass = class MapboxWorker extends Worker {
    constructor() {
      super(workerUrl);
    }
  };
}

function proxyMapboxRequest(url: string): { url: string } {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const mapboxHost =
      host === 'api.mapbox.com' || host === 'tiles.mapbox.com' || host.endsWith('.tiles.mapbox.com');
    if (parsed.protocol !== 'https:' || !mapboxHost) return { url };
    parsed.searchParams.delete('access_token');
    return {
      url: `${window.location.origin}/api/mapbox/proxy?url=${encodeURIComponent(parsed.toString())}`,
    };
  } catch {
    return { url };
  }
}

const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

function useAddressSuggest(query: string, enabled: boolean) {
  const [items, setItems] = useState<SuggestItem[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/suggest?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { items?: SuggestItem[] };
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        if (!cancelled) setItems([]);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  return items;
}

function SuggestList({
  items,
  onPick,
}: {
  items: SuggestItem[];
  onPick: (item: SuggestItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="glass-panel-strong mt-2 max-h-64 overflow-y-auto py-1 shadow-(--lg-shadow-strong)">
      {items.map((item) => (
        <li key={`${item.label}-${item.lat}-${item.lon}`}>
          <button
            type="button"
            className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-(--lg-text) hover:bg-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
          >
            <MapPin className="mt-0.5 size-4 shrink-0 text-(--lg-text-muted)" strokeWidth={1.75} />
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddressMapPicker({
  initialAddress,
  initialPoint,
  saved,
  onConfirm,
  onClose,
  onSaved,
}: {
  initialAddress: string;
  initialPoint: PickedPoint | null;
  saved: SavedAddress[];
  onConfirm: (point: PickedPoint) => void;
  onClose: () => void;
  onSaved: (item: SavedAddress) => void;
}) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const pointRef = useRef<PickedPoint | null>(initialPoint);
  const skipMoves = useRef(0);
  const [draft, setDraft] = useState(initialAddress);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const items = useAddressSuggest(draft, searchOpen);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!mapNode.current) return;
    let cancelled = false;
    let map: MapboxMap | null = null;
    let settling = true;

    const reverseCenter = async () => {
      if (!map) return;
      const center = map.getCenter();
      if (!isInKaliningrad(center.lat, center.lng)) return;
      try {
        const res = await fetch(`/api/geo/reverse?lat=${center.lat}&lon=${center.lng}`);
        const data = (await res.json()) as { item?: SuggestItem | null };
        if (cancelled || !data.item?.label) return;
        const point = { label: data.item.label, lat: data.item.lat, lon: data.item.lon };
        pointRef.current = point;
        setDraft(point.label);
      } catch {
        /* keep the current draft */
      }
    };

    void (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (cancelled || !mapNode.current) return;
      installMapboxWorker(mapboxgl);
      mapboxgl.accessToken = MAP_TOKEN;
      const known = initialPoint && initialPoint.label === initialAddress.trim() ? initialPoint : null;
      map = new mapboxgl.Map({
        container: mapNode.current,
        style: MAP_STYLE,
        center: known ? [known.lon, known.lat] : KALININGRAD_LNG_LAT,
        zoom: known ? 16 : 13,
        maxBounds: KALININGRAD_MAX_BOUNDS,
        attributionControl: false,
        transformRequest: proxyMapboxRequest,
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }));
      map.on('movestart', () => {
        setMoving(true);
        setSearchOpen(false);
      });
      map.on('moveend', () => {
        setMoving(false);
        if (settling) return;
        if (skipMoves.current > 0) {
          skipMoves.current -= 1;
          return;
        }
        void reverseCenter();
      });
      map.on('click', (event) => {
        map?.easeTo({ center: event.lngLat, zoom: Math.max(map.getZoom(), 16) });
      });
      mapRef.current = map;

      map.once('load', () => {
        map?.resize();
        if (known || initialAddress.trim().length < 2) {
          settling = false;
          if (!known && !initialAddress.trim()) void reverseCenter();
          return;
        }
        void fetch(`/api/geo/suggest?q=${encodeURIComponent(initialAddress.trim())}`)
          .then((res) => res.json() as Promise<{ items?: SuggestItem[] }>)
          .then((data) => {
            const first = data.items?.[0];
            settling = false;
            if (!map || !first) return;
            pointRef.current = first;
            skipMoves.current += 1;
            map.jumpTo({ center: [first.lon, first.lat], zoom: 16 });
          })
          .catch(() => {
            settling = false;
          });
      });
    })().catch((error: unknown) => {
      console.error('mapbox init', error);
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [initialAddress, initialPoint]);

  const flyTo = (item: SuggestItem) => {
    const map = mapRef.current;
    pointRef.current = item;
    setDraft(item.label);
    setSearchOpen(false);
    if (!map) return;
    skipMoves.current += 1;
    map.easeTo({ center: [item.lon, item.lat], zoom: 16 });
  };

  const confirm = () => {
    const label = draft.trim();
    if (label.length < 2) return;
    const point = pointRef.current;
    onConfirm(
      point && point.label === label
        ? point
        : { label, lat: point?.lat ?? KALININGRAD_LNG_LAT[1], lon: point?.lon ?? KALININGRAD_LNG_LAT[0] }
    );
  };

  const saveAddress = async () => {
    const label = draft.trim();
    const name = placeName.trim();
    const point = pointRef.current;
    if (label.length < 2 || !name || !point) {
      setSaveNote(point ? 'Укажите имя адреса' : 'Сдвиньте карту, чтобы выбрать точку');
      return;
    }
    setSaving(true);
    setSaveNote('');
    try {
      const res = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, label, lat: point.lat, lon: point.lon }),
      });
      const data = (await res.json().catch(() => ({}))) as { item?: SavedAddress; error?: string };
      if (!res.ok || !data.item) {
        setSaveNote(data.error || 'Не удалось сохранить адрес');
        return;
      }
      onSaved(data.item);
      setSaveNote('Адрес сохранён');
    } catch {
      setSaveNote('Ошибка соединения');
    } finally {
      setSaving(false);
    }
  };

  const addressReady = draft.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[1400] bg-black">
      <div
        ref={mapNode}
        className="address-picker-map"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-full">
        <div className={`origin-bottom transition-transform duration-150 ${moving ? '-translate-y-2' : ''}`}>
          <span className="block size-9 rounded-full bg-[#16a34a] shadow-[0_8px_18px_rgba(0,0,0,0.35)] ring-[3px] ring-white" />
          <span className="mx-auto block h-2.5 w-0.5 bg-[#16a34a]" />
        </div>
        <span className="mx-auto block size-2 rounded-full bg-black/40" />
      </div>

      <div className="absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start gap-2">
          <div className="glass-panel-strong flex min-w-0 flex-1 items-center gap-2 !rounded-full py-1 pr-1.5 pl-3">
            <Search className="size-4 shrink-0 text-(--lg-text-muted)" strokeWidth={1.75} />
            <input
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-(--lg-text) outline-none placeholder:text-(--lg-text-muted)"
              value={draft}
              autoComplete="off"
              placeholder="Улица, дом"
              onChange={(e) => {
                setDraft(e.target.value);
                setSearchOpen(true);
                setSaveNote('');
              }}
              onFocus={() => setSearchOpen(true)}
            />
            {draft.length > 0 && (
              <button
                type="button"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-(--lg-text-muted)"
                aria-label="Стереть"
                onClick={() => {
                  setDraft('');
                  setSearchOpen(true);
                  setSaveNote('');
                }}
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="glass-panel-strong flex size-12 shrink-0 items-center justify-center !rounded-full text-(--lg-text)"
            aria-label="Закрыть карту"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        {searchOpen && draft.trim().length < 2 && saved.length > 0 && (
          <ul className="glass-panel-strong mt-2 max-h-64 overflow-y-auto py-1 shadow-(--lg-shadow-strong)">
            {saved.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPlaceName(item.name);
                    flyTo(item);
                  }}
                >
                  <span className="text-sm font-medium text-(--lg-text)">{item.name}</span>
                  <span className="text-xs text-(--lg-text-muted)">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchOpen && <SuggestList items={items} onPick={flyTo} />}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="glass-panel-strong p-3">
          <p className="mb-3 truncate px-1 text-sm text-(--lg-text)">
            {draft.trim() || 'Найдите улицу или сдвиньте карту'}
          </p>
          {addressReady && (
            <div className="mb-3">
              <label className="mb-2 block">
                <span className="mb-1.5 block text-sm font-medium text-(--lg-text)">Имя адреса</span>
                <input
                  className="w-full rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-4 py-3 text-sm text-(--lg-text) outline-none placeholder:text-(--lg-text-muted)"
                  value={placeName}
                  autoComplete="off"
                  placeholder="Дом, работа"
                  onChange={(e) => {
                    setPlaceName(e.target.value);
                    setSaveNote('');
                  }}
                />
              </label>
              <button
                type="button"
                className="btn-outline w-full py-3"
                disabled={saving}
                onClick={() => void saveAddress()}
              >
                {saving ? 'Сохраняем…' : 'Сохранить адрес'}
              </button>
              {saveNote && <p className="mt-2 px-1 text-center text-sm text-(--lg-text-muted)">{saveNote}</p>}
            </div>
          )}
          <button
            type="button"
            className="btn-primary w-full py-3.5"
            disabled={draft.trim().length < 2}
            onClick={confirm}
          >
            Выбрать
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KaliningradAddressField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const pickedRef = useRef<PickedPoint | null>(null);
  const items = useAddressSuggest(query, suggestOpen);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/addresses')
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: SavedAddress[] }) => {
        if (!cancelled) setSaved(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setSaved([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = (label: string, point?: PickedPoint | null) => {
    setQuery(label);
    onChange(label);
    if (point) pickedRef.current = point;
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-(--lg-text)">Адрес в Калининграде</span>
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            className={inputClass}
            value={query}
            autoComplete="off"
            placeholder="Улица, дом, квартира"
            onChange={(e) => {
              setQuery(e.target.value);
              onChange(e.target.value);
              pickedRef.current = null;
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => window.setTimeout(() => setSuggestOpen(false), 180)}
          />
          {suggestOpen && items.length > 0 && (
            <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30">
              <SuggestList
                items={items}
                onPick={(item) => {
                  apply(item.label, item);
                  setSuggestOpen(false);
                }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn-outline aspect-square shrink-0 px-3"
          aria-label="Указать адрес на карте"
          onClick={() => setMapOpen(true)}
        >
          <MapPin className="size-5" strokeWidth={1.75} />
        </button>
      </div>
      {saved.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {saved.map((item) => (
            <button
              key={item.id}
              type="button"
              className="btn-outline px-3 py-1.5 text-sm"
              onClick={() => apply(item.label, item)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      {mounted && mapOpen
        ? createPortal(
            <AddressMapPicker
              initialAddress={query}
              initialPoint={pickedRef.current}
              saved={saved}
              onClose={() => setMapOpen(false)}
              onSaved={(item) =>
                setSaved((prev) => {
                  const rest = prev.filter((entry) => entry.id !== item.id && entry.name !== item.name);
                  return [...rest, item].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
                })
              }
              onConfirm={(point) => {
                apply(point.label, point);
                setMapOpen(false);
              }}
            />,
            document.body
          )
        : null}
    </div>
  );
}
