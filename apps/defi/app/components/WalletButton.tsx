"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletButton as DSWalletButton } from "@defi/ui";

declare global {
  interface Window {
    phantom?: { solana?: { isPhantom?: boolean } };
  }
}

function phantomIsInjected(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window.phantom?.solana?.isPhantom || (window as any).solana?.isPhantom);
}

function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function openInPhantom(): void {
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
}

export default function WalletButton() {
  const { wallet, publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const handleConnect = () => {
    if (isMobile() && !phantomIsInjected()) {
      openInPhantom();
      return;
    }
    setVisible(true);
  };

  if (!connected || !publicKey) {
    return (
      <DSWalletButton
        variant="disconnected"
        onConnect={handleConnect}
      />
    );
  }

  return (
    <DSWalletButton
      variant="connected"
      address={publicKey.toBase58()}
      walletIcon={wallet?.adapter.icon}
      onCopy={() => navigator.clipboard.writeText(publicKey.toBase58())}
      onChangeWallet={() => setVisible(true)}
      onDisconnect={() => disconnect()}
    />
  );
}
