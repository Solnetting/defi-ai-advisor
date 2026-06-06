"use client";
import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";

const TOKENS = [
  { symbol: "SOL",  mint: "So11111111111111111111111111111111111111112",    decimals: 9  },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6  },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6  },
  { symbol: "JitoSOL", mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", decimals: 9 },
];

function toRaw(amount: string, decimals: number): number {
  return Math.round(parseFloat(amount) * Math.pow(10, decimals));
}

function fromRaw(raw: string | number, decimals: number): string {
  const n = Number(raw) / Math.pow(10, decimals);
  return decimals === 9 ? n.toFixed(4) : n.toFixed(2);
}

interface SwapModalProps {
  defaultFrom?: string;
  defaultTo?: string;
  onClose: () => void;
}

export default function SwapModal({ defaultFrom = "USDC", defaultTo = "SOL", onClose }: SwapModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [fromSymbol, setFromSymbol] = useState(defaultFrom);
  const [toSymbol,   setToSymbol]   = useState(defaultTo);
  const [amount,     setAmount]     = useState("");
  const [quote,      setQuote]      = useState<Record<string, unknown> | null>(null);
  const [quotePending, setQuotePending] = useState(false);
  const [swapping,   setSwapping]   = useState(false);
  const [txSig,      setTxSig]      = useState("");
  const [error,      setError]      = useState("");

  const fromToken = TOKENS.find(t => t.symbol === fromSymbol)!;
  const toToken   = TOKENS.find(t => t.symbol === toSymbol)!;

  // Fetch quote whenever amount / pair changes (debounced)
  useEffect(() => {
    setQuote(null);
    if (!amount || parseFloat(amount) <= 0) return;
    const timer = setTimeout(fetchQuote, 600);
    return () => clearTimeout(timer);
  }, [amount, fromSymbol, toSymbol]);

  async function fetchQuote() {
    setQuotePending(true);
    setError("");
    try {
      const inputAmount = toRaw(amount, fromToken.decimals);
      const res = await fetch(
        `https://api.jup.ag/swap/v1/quote` +
        `?inputMint=${fromToken.mint}` +
        `&outputMint=${toToken.mint}` +
        `&amount=${inputAmount}` +
        `&slippageBps=50`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuote(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Quote failed");
    } finally {
      setQuotePending(false);
    }
  }

  async function executeSwap() {
    if (!quote || !publicKey) return;
    setSwapping(true);
    setError("");
    try {
      // Build swap transaction server-side (platform fee lives there)
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quote, userPublicKey: publicKey.toBase58() }),
      });
      const { swapTransaction, error: swapErr } = await res.json();
      if (swapErr) throw new Error(swapErr);

      // Deserialize versioned transaction
      const tx = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, "base64")
      );

      // Send to wallet for signing + broadcast
      const sig = await sendTransaction(tx, connection, { maxRetries: 3 });

      // Wait for confirmation
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setSwapping(false);
    }
  }

  function flip() {
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
    setAmount("");
    setQuote(null);
  }

  const outAmount    = quote ? fromRaw(quote.outAmount as string, toToken.decimals) : null;
  const priceImpact  = quote ? Math.abs(parseFloat(quote.priceImpactPct as string) * 100) : 0;
  const routeHops    = (quote?.routePlan as unknown[])?.length ?? 0;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="bg-gray-950 border border-gray-800 rounded-t-3xl w-full max-w-sm pb-safe">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 rounded-full bg-gray-800" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-semibold text-white text-base">Swap</span>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors">✕</button>
        </div>

        {txSig ? (
          // ── Success ──
          <div className="px-5 pb-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-400/10 border border-green-400/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-green-400 text-xl">✓</span>
            </div>
            <p className="text-white font-semibold mb-1">Swap complete</p>
            <p className="text-gray-500 text-sm mb-5">
              {amount} {fromSymbol} → {outAmount} {toSymbol}
            </p>
            <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noreferrer"
              className="text-xs text-purple-400 hover:text-purple-300 underline">
              View on Solscan ↗
            </a>
            <button onClick={onClose}
              className="w-full mt-5 bg-white text-black font-semibold py-3 rounded-full text-sm hover:bg-gray-100 transition-colors">
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 pb-6 space-y-3">

            {/* From */}
            <div className="bg-gray-900 rounded-2xl px-4 pt-3 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-600">You pay</span>
                <select
                  value={fromSymbol}
                  onChange={(e) => { setFromSymbol(e.target.value); setQuote(null); setAmount(""); }}
                  className="bg-gray-800 text-xs text-white rounded-full px-2 py-1 outline-none border border-gray-700"
                >
                  {TOKENS.filter(t => t.symbol !== toSymbol).map(t => (
                    <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                  ))}
                </select>
              </div>
              <input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent text-3xl font-bold text-white outline-none placeholder-gray-800"
              />
            </div>

            {/* Flip */}
            <div className="flex justify-center -my-1 relative z-10">
              <button onClick={flip}
                className="w-9 h-9 rounded-full bg-gray-900 border border-gray-800 hover:border-gray-700 flex items-center justify-center text-gray-500 hover:text-white transition-colors text-sm">
                ↕
              </button>
            </div>

            {/* To */}
            <div className="bg-gray-900 rounded-2xl px-4 pt-3 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-600">You receive</span>
                <select
                  value={toSymbol}
                  onChange={(e) => { setToSymbol(e.target.value); setQuote(null); }}
                  className="bg-gray-800 text-xs text-white rounded-full px-2 py-1 outline-none border border-gray-700"
                >
                  {TOKENS.filter(t => t.symbol !== fromSymbol).map(t => (
                    <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                  ))}
                </select>
              </div>
              <div className="text-3xl font-bold text-white">
                {quotePending
                  ? <span className="text-gray-700 text-base animate-pulse">Fetching…</span>
                  : outAmount
                  ? <span className="text-green-400">{outAmount}</span>
                  : <span className="text-gray-800">0</span>
                }
              </div>
            </div>

            {/* Quote details */}
            {quote && (
              <div className="bg-gray-900/50 rounded-xl px-4 py-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Price impact</span>
                  <span className={priceImpact > 1 ? "text-red-400" : priceImpact > 0.3 ? "text-yellow-400" : "text-gray-400"}>
                    {priceImpact < 0.01 ? "<0.01" : priceImpact.toFixed(2)}%
                    {priceImpact > 1 && " ⚠"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Slippage</span>
                  <span className="text-gray-400">0.5%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Route</span>
                  <span className="text-gray-400">{routeHops} hop{routeHops !== 1 ? "s" : ""} · Jupiter</span>
                </div>
              </div>
            )}

            {error && <p className="text-red-400 text-xs px-1">{error}</p>}

            {!publicKey ? (
              <p className="text-center text-xs text-gray-600 py-3">Connect your wallet to swap</p>
            ) : (
              <button
                onClick={executeSwap}
                disabled={!quote || swapping || quotePending}
                className="w-full bg-white text-black font-semibold py-3.5 rounded-full hover:bg-gray-100 disabled:opacity-40 transition-colors text-sm mt-1"
              >
                {swapping    ? "Swapping…"
                : quotePending ? "Getting quote…"
                : quote       ? `Swap ${fromSymbol} → ${toSymbol}`
                :               "Enter an amount"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
