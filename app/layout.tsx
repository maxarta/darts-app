import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Geist } from "next/font/google";
import { SyncOnOnline } from "@/components/game/SyncOnOnline";
import { TelegramProvider } from "@/components/TelegramProvider";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const martianGrotesk = localFont({
  src: "./fonts/MartianGrotesk-VF.woff2",
  variable: "--font-darts",
  display: "swap",
  weight: "100 1000",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Darts Score",
  description: "Подсчёт очков 301/501, турниры и статистика",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffdf20" },
    { media: "(prefers-color-scheme: dark)", color: "#ffdf20" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={cn("font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body className={martianGrotesk.className}>
        <TelegramProvider>
          <SyncOnOnline />
          <div className="appShell">{children}</div>
        </TelegramProvider>
      </body>
    </html>
  );
}
