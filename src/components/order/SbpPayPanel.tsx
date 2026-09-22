'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';

interface PaymentResponse {
  paymentStatus?: string;
  bankStatus?: string | null;
  payload?: string | null;
  error?: string;
}

export default function SbpPayPanel({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const [svg, setSvg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['order-payment', orderId],
    queryFn: async (): Promise<PaymentResponse> => {
      const res = await fetch(`/api/orders/${orderId}/payment`);
      return res.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.paymentStatus;
      if (status === 'SUCCEEDED' || status === 'CANCELLED') return false;
      return 4000;
    },
  });

  useEffect(() => {
    const payload = data?.payload;
    if (!payload) {
      setSvg('');
      return;
    }
    let cancelled = false;
    QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#0a0a0a', light: '#ffffffff' },
    }).then((value) => {
      if (!cancelled) setSvg(value);
    });
    return () => {
      cancelled = true;
    };
  }, [data?.payload]);

  useEffect(() => {
    if (data?.paymentStatus === 'SUCCEEDED' || data?.paymentStatus === 'CANCELLED') {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    }
  }, [data?.paymentStatus, orderId, queryClient]);

  if (data?.paymentStatus === 'SUCCEEDED') return null;

  if (data?.paymentStatus === 'CANCELLED') {
    return (
      <div className="glass-panel mb-4 border border-rose-400/35 bg-rose-500/18 p-4 text-sm text-(--lg-text)">
        Оплата не прошла или время QR истекло. Заказ отменён, бонусы возвращены.
      </div>
    );
  }

  return (
    <div className="glass-panel mb-4 p-4">
      <h2 className="mb-1 text-center text-base font-semibold text-(--lg-text)">Оплата по СБП</h2>
      <p className="mb-4 text-center text-sm text-(--lg-text-muted)">
        Отсканируйте QR или откройте приложение банка. Статус обновится сам.
      </p>
      {isLoading && !svg ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-(--lg-text-muted)" />
        </div>
      ) : svg ? (
        <div
          className="mx-auto mb-4 size-52 overflow-hidden rounded-2xl bg-white p-3 [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <p className="mb-4 text-center text-sm text-(--lg-text-muted)">Готовим ссылку на оплату…</p>
      )}
      {data?.payload ? (
        <a href={data.payload} className="btn-primary mb-2 flex w-full items-center justify-center gap-2 py-3">
          <ExternalLink className="size-4" strokeWidth={1.75} />
          Открыть приложение банка
        </a>
      ) : null}
    </div>
  );
}
