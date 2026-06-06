import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";
import SolanaWalletProvider from "./components/WalletProvider";

const spaceMono = Space_Mono({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DeFi AI Advisor",
  description: "AI-powered Solana portfolio advisor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} antialiased`}
    >
      <body className="bg-gray-900 h-dvh flex items-center justify-center">
        <SolanaWalletProvider>
          {/* Phone shell — all pages share this container */}
          <div className="h-dvh w-full max-w-[390px] bg-black text-white flex flex-col overflow-hidden">
            {children}
          </div>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}
