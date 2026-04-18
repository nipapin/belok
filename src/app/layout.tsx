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
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#eceef3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const themeInitScript = `(function(){try{var k='theme',s=localStorage.getItem(k);if(s==='light'||s==='dark'){document.documentElement.setAttribute('data-theme',s);return;}var d=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',d);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

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
