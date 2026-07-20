import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Task Launcher", template: "%s — Task Launcher" },
  description: "Быстрая постановка задач в Bitrix24",
  applicationName: "Task Launcher",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Task Launcher" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f9f8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-svh antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
