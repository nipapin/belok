import { ProxyAgent, fetch as undiciFetch, type Response as UndiciResponse } from 'undici';

const ALLOWED_HOSTS = new Set(['api.mapbox.com', 'events.mapbox.com']);

let proxyAgent: ProxyAgent | null = null;

export function isMapboxHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname) || hostname.endsWith('.tiles.mapbox.com');
}

function outboundProxy(): ProxyAgent | null {
  const proxy = process.env.MAPBOX_HTTPS_PROXY?.trim();
  if (!proxy) return null;
  proxyAgent ??= new ProxyAgent(proxy);
  return proxyAgent;
}

/** Fetch a Mapbox URL, optionally via MAPBOX_HTTPS_PROXY. */
export async function mapboxFetch(url: URL): Promise<UndiciResponse | Response> {
  const dispatcher = outboundProxy();
  if (!dispatcher) {
    return fetch(url, { cache: 'no-store', redirect: 'manual' });
  }
  return undiciFetch(url, { dispatcher, redirect: 'manual' });
}

export async function fetchMapbox(url: URL, hops = 0): Promise<UndiciResponse | Response> {
  const response = await mapboxFetch(url);
  if (response.status < 300 || response.status >= 400 || hops >= 2) return response;
  const location = response.headers.get('location');
  if (!location) return response;
  const next = new URL(location, url);
  if (next.protocol !== 'https:' || !isMapboxHost(next.hostname)) return response;
  return fetchMapbox(next, hops + 1);
}
