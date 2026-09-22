import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

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
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    // Wait for the user to confirm the update via UpdateToast.
    // The user clicks "Обновить" → we postMessage SKIP_WAITING to the
    // waiting SW → it activates → workbox-window fires `controlling` → we reload.
    skipWaiting: false,
    clientsClaim: true,
    // Entries below replace the default ones with the same cacheName; the
    // default static-asset caches (JS, CSS, images, fonts) stay untouched.
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
    ],
  },
});

const nextConfig: NextConfig = {
  env: {
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
