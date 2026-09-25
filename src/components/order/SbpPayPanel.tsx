'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';

interface PaymentResponse {
  paymentStatus?: string;
  bankStatus?: string | null;
  payload?: string | null;
  image?: string | null;
  error?: string;
}

function presentQrSvg(svg: string, px: number): string {
  const safe = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  const withCrisp = safe.includes('shape-rendering=')
    ? safe.replace(/shape-rendering="[^"]*"/, 'shape-rendering="crispEdges"')
    : safe.replace('<svg', '<svg shape-rendering="crispEdges"');
  return withCrisp
    .replace(/\swidth="[^"]*"/, ` width="${px}"`)
    .replace(/\sheight="[^"]*"/, ` height="${px}"`);
}

export default function SbpPayPanel({
  orderId,
  statusUrl,
  initialPayload = null,
  initialImage = null,
  onStatus,
  showBankLink = true,
  qrPx = 264,
  hint = 'Отсканируйте QR или откройте приложение банка. Статус обновится сам.',
  cancelledMessage = 'Оплата не прошла или время QR истекло. Заказ отменён, бонусы возвращены.',
}: {
  orderId: string;
  statusUrl?: string;
  initialPayload?: string | null;
  initialImage?: string | null;
  onStatus?: (status: string) => void;
  showBankLink?: boolean;
  qrPx?: number;
  hint?: string;
  cancelledMessage?: string;
}) {
  const queryClient = useQueryClient();
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const { data, isLoading } = useQuery({
    queryKey: ['order-payment', orderId, statusUrl],
    queryFn: async (): Promise<PaymentResponse> => {
      const res = await fetch(statusUrl ?? `/api/orders/${orderId}/payment`);
      return res.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.paymentStatus;
      if (status === 'SUCCEEDED' || status === 'CANCELLED') return false;
      return 4000;
    },
  });

  const payload = data?.payload || initialPayload || null;
  const image = data?.image || initialImage || null;
  const svg = image?.trim().startsWith('<svg') ? presentQrSvg(image, qrPx) : '';

  useEffect(() => {
    const status = data?.paymentStatus;
    if (!status) return;
    onStatusRef.current?.(status);
    if (status === 'SUCCEEDED' || status === 'CANCELLED') {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    }
  }, [data?.paymentStatus, orderId, queryClient]);

  if (data?.paymentStatus === 'SUCCEEDED') return null;

  if (data?.paymentStatus === 'CANCELLED') {
    return (
      <div className="glass-panel mb-4 border border-rose-400/35 bg-rose-500/18 p-4 text-sm text-(--lg-text)">
        {cancelledMessage}
      </div>
    );
  }

  return (
    <div className="glass-panel mb-4 p-4">
      <h2 className="mb-1 text-center text-base font-semibold text-(--lg-text)">Оплата по СБП</h2>
      <p className="mb-4 text-center text-sm text-(--lg-text-muted)">{hint}</p>
      {isLoading && !svg ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-(--lg-text-muted)" />
        </div>
      ) : svg ? (
        <div
          className="mx-auto mb-4 w-fit rounded-2xl bg-white p-4 [&_svg]:block"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <p className="mb-4 text-center text-sm text-(--lg-text-muted)">Готовим QR-код…</p>
      )}
      {showBankLink && payload ? (
        <a href={payload} className="btn-primary mb-2 flex w-full items-center justify-center gap-2 py-3">
          <ExternalLink className="size-4" strokeWidth={1.75} />
          Открыть приложение банка
        </a>
      ) : null}
    </div>
  );
}
