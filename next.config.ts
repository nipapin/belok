import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { execFileSync } from "node:child_process";

function buildRevision() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return "local"; }
}

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Custom worker code (push handlers, notificationclick) is bundled into
  // the generated SW from this directory. See src/worker/index.ts.
  customWorkerSrc: "src/worker",
  // HTML/RSC/API responses depend on the session and on the current build, so
  // they must never be served from cache: the default NetworkFirst entries
  // could answer with another session's markup or with chunk hashes that a
  // deploy has already removed, and on a network blip with nothing cached for
  // that exact URL they failed with "no-response" instead of a page.
  cacheStartUrl: false,
  dynamicStartUrl: false,
  reloadOnOnline: false,
  extendDefaultRuntimeCaching: false,
  workboxOptions: {
    // Activate fresh caching rules promptly; page reloads remain coordinated.
    skipWaiting: true,
    clientsClaim: true,
    // Explicit rules keep HTML, RSC and API replies out of old runtime caches.
    // `src/app/~offline/page.tsx` is auto-detected as the document fallback, so
    // a navigation that cannot reach the network renders that page.
    runtimeCaching: [
      {
        urlPattern: ({ request, sameOrigin }) =>
          sameOrigin && (request.mode === "navigate" || request.destination === "document"),
        handler: "NetworkOnly",
        options: { cacheName: "pages" },
      },
      {
        urlPattern: ({ request, sameOrigin }) =>
          sameOrigin &&
          request.headers.get("RSC") === "1" &&
          request.headers.get("Next-Router-Prefetch") === "1",
        handler: "NetworkOnly",
        options: { cacheName: "pages-rsc-prefetch" },
      },
      {
        urlPattern: ({ request, sameOrigin }) => sameOrigin && request.headers.get("RSC") === "1",
        handler: "NetworkOnly",
        options: { cacheName: "pages-rsc" },
      },
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        options: { cacheName: "apis" },
      },
      {
        urlPattern: ({ request, sameOrigin }) => sameOrigin && ['script', 'style', 'font', 'image'].includes(request.destination),
        handler: 'CacheFirst',
        options: { cacheName: 'belok-static-assets', expiration: { maxEntries: 256, maxAgeSeconds: 30 * 86400 } },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: async () => process.env.GITHUB_SHA || null,
  async headers() {
    return ['/sw.js', '/manifest.json'].map(source => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' }],
    }));
  },
  env: {
    NEXT_PUBLIC_BUILD_REVISION: buildRevision(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    // Public Mapbox token (pk.). Stored as MAPBOX_API_KEY so the same value
    // stays server-side for geocoding and is inlined for the map tiles.
    NEXT_PUBLIC_MAPBOX_API_KEY: process.env.MAPBOX_API_KEY ?? "",
  },
  turbopack: {},
  allowedDevOrigins: ["192.168.1.35"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default withPWA(nextConfig);
