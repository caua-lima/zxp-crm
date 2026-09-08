import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZXP CRM",
  description: "Painel de leads da RUMO — ZXP Solutions.",
  // O painel lista nome, telefone e relato pessoal de menores de idade.
  // Ele não pode ser indexado em hipótese alguma. O proxy também manda o
  // cabeçalho X-Robots-Tag, que cobre respostas que nem chegam a renderizar.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = {
  themeColor: "#10100E",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-onyx text-marfim">
        {children}
      </body>
    </html>
  );
}
