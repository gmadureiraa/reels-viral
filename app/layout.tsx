import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Toaster } from "sonner";
import { Footer } from "@/components/footer";
import { MetaPixel } from "@/components/MetaPixel";
import { ReferralCapture } from "@/components/ReferralCapture";
import ThemeScript from "./theme-script";
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

// Tipografia da marca Kaleidos:
//   Inter    → corpo/UI (sans)
//   Atelier  → títulos/display
//   Gridlite → accent/eyebrows/labels pequenos
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const atelier = localFont({
  src: "../public/fonts/Atelier.ttf",
  variable: "--font-atelier",
  display: "swap",
  weight: "400",
});

const gridlite = localFont({
  src: "../public/fonts/Gridlite.otf",
  variable: "--font-gridlite",
  display: "swap",
  weight: "400",
});

// metadataBase precisa estar definido pro Next gerar URLs absolutas
// das imagens (og:image, twitter:image). Sem isso aparece warning no
// build e clients que exigem URL absoluta (Twitter/X) ignoram o card.
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://reels.kaleidos.com.br"
  ),
  title: "Reels Viral — Roteiros que copiam o que viraliza",
  description:
    "Cole o link de qualquer Reel viral. A IA dissecca a estrutura (hook, promessa, demo, CTA) e devolve um roteiro novo, adaptado ao seu nicho, cena por cena.",
  authors: [{ name: "Kaleidos" }],
  creator: "Kaleidos",
  openGraph: {
    title: "Reels Viral — Roteiros que copiam o que viraliza",
    description:
      "Engenharia reversa de qualquer Reel viral em 30s: estrutura desmontada + roteiro novo cena por cena.",
    type: "website",
    locale: "pt_BR",
    siteName: "Reels Viral",
  },
  twitter: {
    card: "summary_large_image",
    title: "Reels Viral — Roteiros que copiam o que viraliza",
    description:
      "Cole um Reel. Recebe um roteiro novo cena por cena, na sua voz.",
    creator: "@madureira",
  },
  // Facebook domain verification — pareia com Pixel 1708595326965933 no
  // Madureira BM (704738313932684). Atribui reels.kaleidos.com.br ao BM.
  // Necessário pra Aggregated Event Measurement (iOS 14+).
  other: {
    "facebook-domain-verification": "csf0msjkmwxo95330m142xec4t1g2a",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAFAFA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${atelier.variable} ${gridlite.variable}`}
    >
      <head>
        {/* Anti-FOUC: seta data-theme="dark" antes do paint. */}
        <ThemeScript />
      </head>
      <body
        style={{
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          minHeight: "100dvh",
        }}
      >
        <MetaPixel pixelId="1708595326965933" />
        <ReferralCapture />
        {children}
        <Footer />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              fontSize: "13px",
              border: "1.5px solid var(--color-rv-ink)",
              borderRadius: 0,
              background: "var(--color-rv-cream)",
              color: "var(--color-rv-ink)",
              boxShadow: "4px 4px 0 0 var(--color-rv-ink)",
            },
          }}
        />
      </body>
      {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
    </html>
  );
}
