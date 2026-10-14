'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { buildVersion } from '@/lib/buildVersion';
import { updateAdminApplication } from '@/lib/adminApplicationUpdate';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';

export default function AdminUpdateButton() {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const { updateAvailable: workerUpdateAvailable } = useServiceWorkerUpdate();
  const { data } = useQuery({
    queryKey: ['admin-build-version'],
    queryFn: async () => {
      const response = await fetch('/api/admin/version', { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось проверить версию');
      return response.json() as Promise<typeof buildVersion>;
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: 'always',
  });
  const updateAvailable = workerUpdateAvailable || Boolean(data &&
    (data.revision !== buildVersion.revision || data.builtAt !== buildVersion.builtAt));
  const label = updating ? 'Обновляем админку…' : updateAvailable ? 'Доступно обновление — обновить админку' : 'Админка обновлена';
  const update = async () => {
    if (!updateAvailable || updating) return;
    setUpdating(true);
    setError('');
    try { await updateAdminApplication(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить админку. Попробуйте снова.');
      setUpdating(false);
    }
  };
  return <>
    <button type="button" className={`admin-environment ${updateAvailable ? 'has-update' : ''}`}
      disabled={!updateAvailable || updating} aria-label={label} aria-busy={updating}
      title={error || label} onClick={() => void update()}>
      {process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_APP_URL?.includes('dev.') ? 'DEV' : 'ADMIN'}
      {updateAvailable && <span className="admin-update-badge" aria-hidden="true">
        {updating ? <Loader2 size={10} className="animate-spin" /> : null}
      </span>}
    </button>
    <span className="sr-only" role="status">{updateAvailable ? label : ''}</span>
    {error && <span className="admin-update-error" role="alert">{error}</span>}
  </>;
}
