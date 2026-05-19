import type { Metadata, Viewport } from "next";
import { Geologica } from "next/font/google";
import Script from "next/script";
import QueryProvider from "@/lib/QueryProvider";
import { brandMark } from "@/lib/brand";
import "./globals.css";

const geologica = Geologica({
  subsets: ["latin", "cyrillic"],
  variable: "--font-geologica",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${brandMark} — кафе здорового питания`,
  description:
    "Заказ здоровой еды онлайн: меню, кастомизация блюд, бонусы и доставка.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: brandMark,
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#bacef0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const themeInitScript = `(function(){try{var k='theme',s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:'dark';document.documentElement.setAttribute('data-theme',t);var c=t==='light'?'#e8eef7':'#bacef0';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',c);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={geologica.variable} data-theme="dark" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
