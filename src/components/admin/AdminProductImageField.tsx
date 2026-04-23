'use client';

import { useCallback, useRef, useState } from 'react';
import { ImageUp, Images, Trash2 } from 'lucide-react';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/*';

type AdminProductImageFieldProps = {
  /** Текущее превью: новый файл или URL с сервера */
  previewUrl: string | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  /** Если false — подпись не рендерится (заголовок секции снаружи) */
  showHeading?: boolean;
};

function pickFileFromInput(file: File | undefined, onFileSelect: (file: File) => void) {
  if (file && file.type.startsWith('image/')) onFileSelect(file);
}

export default function AdminProductImageField({
  previewUrl,
  onFileSelect,
  onClear,
  showHeading = true,
}: AdminProductImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isPressing, setIsPressing] = useState(false);

  const openFilePicker = useCallback(() => {
    const el = fileInputRef.current;
    if (el) {
      el.value = '';
      el.click();
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      pickFileFromInput(f, onFileSelect);
    },
    [onFileSelect]
  );

  const onDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="w-full">
      {showHeading ? <p className="admin-form-eyebrow mb-3">Фотография</p> : null}

      <div
        className={[
          'relative w-full overflow-hidden rounded-2xl transition-all duration-200',
          previewUrl
            ? 'ring-1 ring-[color-mix(in_srgb,var(--lg-text)_10%,transparent)] shadow-sm'
            : 'aspect-2/3 border border-dashed',
          previewUrl
            ? ''
            : dragOver
              ? 'border-(--lg-ring-strong) bg-[color-mix(in_srgb,var(--lg-text)_7%,transparent)]'
              : 'border-(--lg-ring) bg-[color-mix(in_srgb,var(--lg-text)_3%,transparent)]',
          isPressing && !previewUrl ? 'scale-[0.99]' : 'scale-100',
        ].join(' ')}
        onDragEnter={(e) => {
          onDrag(e);
          setDragOver(true);
        }}
        onDragOver={(e) => {
          onDrag(e);
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          onDrag(e);
          const to = e.relatedTarget as Node | null;
          if (to && e.currentTarget.contains(to)) return;
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        {previewUrl ? (
          <div className="relative aspect-2/3 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/50 to-transparent p-3 pt-12" />
            <div className="absolute bottom-0 left-0 right-0 flex flex-wrap gap-2 p-3 sm:justify-end">
              <button
                type="button"
                onClick={openFilePicker}
                className="pointer-events-auto inline-flex min-h-11 min-w-[44px] flex-1 items-center justify-center gap-2 rounded-full border border-white/30 bg-white/90 px-4 text-sm font-semibold text-(--lg-text) shadow-sm backdrop-blur-sm transition hover:bg-white sm:flex-initial"
              >
                <ImageUp className="size-4 shrink-0" aria-hidden />
                Заменить
              </button>
              <button
                type="button"
                onClick={onClear}
                className="pointer-events-auto inline-flex min-h-11 min-w-[44px] items-center justify-center gap-2 rounded-full border border-white/25 bg-rose-600/90 px-3 text-sm font-semibold text-white shadow-sm backdrop-blur-sm transition hover:bg-rose-600"
                aria-label="Удалить фото"
              >
                <Trash2 className="size-4" aria-hidden />
                <span>Удалить</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openFilePicker}
            onPointerDown={() => setIsPressing(true)}
            onPointerUp={() => setIsPressing(false)}
            onPointerLeave={() => setIsPressing(false)}
            className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 px-4 py-4 text-center sm:gap-3 sm:py-6"
            aria-label="Добавить фото"
          >
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)] text-(--lg-text) sm:size-16">
              <Images className="size-7 sm:size-8" strokeWidth={1.5} />
            </div>
            <span className="text-lg font-medium tracking-tight text-(--lg-text) sm:text-xl">Добавить фото</span>
            <span className="max-w-[20rem] text-pretty text-xs leading-relaxed text-(--lg-text-muted) sm:text-sm">
              Коснитесь, чтобы открыть галерею или съёмку
            </span>
            <span className="hidden text-xs text-(--lg-text-muted) sm:inline">На десктопе можно перетащить файл сюда</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          pickFileFromInput(e.target.files?.[0], onFileSelect);
          e.target.value = '';
        }}
      />
    </div>
  );
}
