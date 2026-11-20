import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SOHTMON ERP", template: "%s · SOHTMON ERP" },
  description: "Склад, продажи, клиенты, касса и отчёты",
  applicationName: "SOHTMON ERP",
  appleWebApp: { capable: true, title: "SOHTMON", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2557eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
