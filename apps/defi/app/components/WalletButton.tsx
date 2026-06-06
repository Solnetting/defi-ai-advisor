"use client";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export default function WalletButton() {
  const { wallet, publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-1.5 text-xs text-gray-400 hover:text-white hover:border-gray-700 transition-colors"
      >
        Connect Wallet
      </button>
    );
  }

  const addr = publicKey.toBase58();
  const short = `${addr.slice(0, 4)}…${addr.slice(-4)}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full pl-2 pr-3 py-1.5 hover:border-gray-700 transition-colors"
      >
        {wallet?.adapter.icon ? (
          <img src={wallet.adapter.icon} alt={wallet.adapter.name} className="w-5 h-5 rounded-full" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-gray-700" />
        )}
        <span className="text-xs text-white font-medium tabular-nums">{short}</span>
        <svg className="w-3 h-3 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden min-w-[160px]">
          <button
            onClick={() => { navigator.clipboard.writeText(addr); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Copy address
          </button>
          <button
            onClick={() => { setVisible(true); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Change wallet
          </button>
          <div className="border-t border-gray-800" />
          <button
            onClick={() => { disconnect(); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-gray-800 transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
