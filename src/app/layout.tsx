import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { SWRegister } from "@/components/SWRegister";
import { BASE_PATH } from "@/lib/config";

export const metadata: Metadata = {
  title: "ContentPilot",
  description: "Turn your photos and clips into ready-to-post TikTok, Instagram and Facebook content.",
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "ContentPilot", statusBarStyle: "black-translucent" },
  icons: { icon: `${BASE_PATH}/icon-192.png`, apple: `${BASE_PATH}/apple-touch-icon.png` },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
        <SWRegister />
      </body>
    </html>
  );
}
