import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Custom worker code (push handlers, notificationclick) is bundled into
  // the generated SW from this directory. See src/worker/index.ts.
  customWorkerSrc: "src/worker",
  workboxOptions: {
    // Wait for the user to confirm the update via UpdateToast.
    // The user clicks "Обновить" → we postMessage SKIP_WAITING to the
    // waiting SW → it activates → workbox-window fires `controlling` → we reload.
    skipWaiting: false,
    clientsClaim: true,
  },
});

const nextConfig: NextConfig = {
  turbopack: {},
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
