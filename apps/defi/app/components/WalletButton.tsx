"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletButton as DSWalletButton } from "@defi/ui";
import { connectWallet } from "../lib/connectWallet";

export default function WalletButton() {
  const { wallet, publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const handleConnect = () => connectWallet(setVisible);

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
