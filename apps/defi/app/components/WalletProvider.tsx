"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";
import "@solana/wallet-adapter-react-ui/styles.css";

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export default function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = "https://api.mainnet-beta.solana.com";

  const wallets = useMemo(() => {
    const adapters = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
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
