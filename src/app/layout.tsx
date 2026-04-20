import type { Metadata } from "next";
import {
  Epilogue,
  Geist_Mono,
  Bangers,
  JetBrains_Mono,
  Playfair_Display,
  Inter,
} from "next/font/google";
import "./globals.css";

const epilogue = Epilogue({
  variable: "--font-epilogue",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// — Caption premium fonts (Google Fonts side) —
const bangers = Bangers({
  weight: "400",
  variable: "--font-bangers",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Reel — Premium Video Editor",
  description: "Offline-first, browser-native video editor. Zero cloud cost.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cls = [
    epilogue.variable,
    geistMono.variable,
    bangers.variable,
    jetbrains.variable,
    playfair.variable,
    inter.variable,
  ].join(" ");
  return (
    <html lang="en" className={`${cls} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
