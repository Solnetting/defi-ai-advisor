"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";
import "@solana/wallet-adapter-react-ui/styles.css";

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

// PhantomWalletAdapter only detects the browser extension.
// On iPhone without the extension, connect() fails silently.
// This subclass intercepts connect() on mobile and redirects to Phantom's
// in-app browser via Universal Link, where window.phantom IS injected.
class PhantomMobileAdapter extends PhantomWalletAdapter {
  override async connect(): Promise<void> {
    if (typeof window === "undefined") return super.connect();
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const injected = !!(window as any).phantom?.solana?.isPhantom || !!(window as any).solana?.isPhantom;
    if (mobile && !injected) {
      const url = encodeURIComponent(window.location.href);
      const ref = encodeURIComponent(window.location.origin);
      window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
      return;
    }
    return super.connect();
  }
}

export default function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = "https://api.mainnet-beta.solana.com";

  const wallets = useMemo(() => {
    const adapters = [new PhantomMobileAdapter(), new SolflareWalletAdapter()];
    if (WALLETCONNECT_PROJECT_ID) {
      adapters.push(
        new WalletConnectWalletAdapter({
          network: WalletAdapterNetwork.Mainnet,
          options: { projectId: WALLETCONNECT_PROJECT_ID },
        }) as never
      );
    }
    return adapters;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
