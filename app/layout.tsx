import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Instrument_Serif, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
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
  },
};

export const viewport: Viewport = {
  themeColor: "#F5F1E8",
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
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body
        style={{
          fontFamily: "var(--font-jakarta), system-ui, sans-serif",
          minHeight: "100dvh",
        }}
      >
        {children}
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
    </html>
  );
}
