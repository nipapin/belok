import type { Metadata, Viewport } from "next";
import AdminShell from "@/components/admin/AdminShell";
import { brandMark } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Панель управления · ${brandMark}`,
};

// Override the storefront's zoom restriction for the administrative workspace.
export const viewport: Viewport = {
  maximumScale: 5,
  userScalable: true,
  themeColor: "#f5f7f5",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
