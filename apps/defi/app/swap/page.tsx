"use client";

import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import BottomNav from "../components/BottomNav";
import WalletButton from "../components/WalletButton";

const TOKENS = [
  { symbol: "SOL",     mint: "So11111111111111111111111111111111111111112",    decimals: 9 },
  { symbol: "USDC",    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "USDT",    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  { symbol: "JitoSOL", mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", decimals: 9 },
];

function toRaw(amount: string, decimals: number): number {
  return Math.round(parseFloat(amount) * Math.pow(10, decimals));
}
function fromRaw(raw: string | number, decimals: number): string {
  const n = Number(raw) / Math.pow(10, decimals);
  return decimals === 9 ? n.toFixed(4) : n.toFixed(2);
}
function fmtBalance(n: number, decimals: number): string {
  return decimals === 9 ? n.toFixed(4) : n.toFixed(2);
}

export default function SwapPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [fromSymbol, setFromSymbol] = useState("USDC");
  const [toSymbol,   setToSymbol]   = useState("SOL");
  const [amount,     setAmount]     = useState("");
  const [quote,      setQuote]      = useState<Record<string, unknown> | null>(null);
  const [quotePending, setQuotePending] = useState(false);
  const [swapping,   setSwapping]   = useState(false);
  const [txSig,      setTxSig]      = useState("");
  const [error,      setError]      = useState("");
  const [balance,    setBalance]    = useState<number | null>(null);

  const fromToken = TOKENS.find(t => t.symbol === fromSymbol)!;
  const toToken   = TOKENS.find(t => t.symbol === toSymbol)!;

  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }
    let cancelled = false;
    async function fetchBalance() {
      try {
        let bal: number;
        if (fromToken.symbol === "SOL") {
          const res = await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [publicKey!.toBase58()] }),
          });
          const { result } = await res.json();
          bal = result.value / 1e9;
        } else {
          const res = await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner",
              params: [publicKey!.toBase58(), { mint: fromToken.mint }, { encoding: "jsonParsed" }],
            }),
          });
          const { result } = await res.json();
          bal = result.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
        }
        if (!cancelled) setBalance(bal);
      } catch {
        if (!cancelled) setBalance(0);
      }
    }
    fetchBalance();
    return () => { cancelled = true; };
  }, [publicKey, fromSymbol, fromToken.mint, fromToken.symbol]);

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
        `?inputMint=${fromToken.mint}&outputMint=${toToken.mint}&amount=${inputAmount}&slippageBps=50`
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
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quote, userPublicKey: publicKey.toBase58() }),
      });
      const { swapTransaction, error: swapErr } = await res.json();
      if (swapErr) throw new Error(swapErr);
      const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
      const sig = await sendTransaction(tx, connection, { maxRetries: 3 });
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
    setError("");
  }

  function setPercent(pct: number) {
    if (!balance || balance <= 0) return;
    const raw = balance * (pct / 100);
    const val = fromToken.symbol === "SOL" ? Math.max(0, raw - 0.005) : raw;
    setAmount(fmtBalance(val, fromToken.decimals));
    setError("");
  }

  const outAmount   = quote ? fromRaw(quote.outAmount as string, toToken.decimals) : null;
  const priceImpact = quote ? Math.abs(parseFloat(quote.priceImpactPct as string) * 100) : 0;
  const routeHops   = (quote?.routePlan as unknown[])?.length ?? 0;

  return (
    <main className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-2">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold">Swap</h1>
            <p className="text-xs text-gray-600 mt-0.5">Via Jupiter · best route</p>
          </div>
          <WalletButton />
        </div>

        {txSig ? (
          <div className="mt-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-400/10 border border-green-400/30 flex items-center justify-center mx-auto">
              <span className="text-green-400 text-2xl">✓</span>
            </div>
            <p className="text-white font-semibold">Swap complete</p>
            <p className="text-gray-500 text-sm">{amount} {fromSymbol} → {outAmount} {toSymbol}</p>
            <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noreferrer"
              className="inline-block text-xs text-purple-400 hover:text-purple-300 underline">
              View on Solscan ↗
            </a>
            <button
              onClick={() => { setTxSig(""); setAmount(""); setQuote(null); }}
              className="block w-full mt-2 bg-white text-black font-semibold py-3.5 rounded-full text-sm hover:bg-gray-100 transition-colors"
            >
              New swap
            </button>
          </div>
        ) : (
          <div className="space-y-3">

            {/* From + Flip + To — grouped to control the overlap precisely */}
            <div className="flex flex-col gap-[2px]">

              {/* From */}
              <div className="bg-gray-950 border border-gray-800 rounded-2xl px-4 pt-3 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-600">You pay</span>
                  <select
                    value={fromSymbol}
                    onChange={(e) => { setFromSymbol(e.target.value); setQuote(null); setAmount(""); setError(""); }}
                    className="bg-gray-900 text-xs text-white rounded-full px-2 py-1 outline-none border border-gray-700"
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
                  onChange={(e) => {
                    const val = e.target.value;
                    const num = parseFloat(val);
                    const max = balance !== null ? (fromToken.symbol === "SOL" ? Math.max(0, balance - 0.005) : balance) : Infinity;
                    if (!isNaN(num) && num > max) {
                      setAmount(fmtBalance(max, fromToken.decimals));
                    } else {
                      setAmount(val);
                    }
                    setError("");
                  }}
                  className="w-full bg-transparent text-3xl font-bold text-white outline-none placeholder-gray-800"
                />

                {/* Balance + % shortcuts — always visible */}
                <div className="flex items-center justify-between mt-3 gap-2">
                  <span className="text-xs text-gray-400 shrink-0">
                    {balance !== null
                      ? `Available: ${fmtBalance(balance, fromToken.decimals)} ${fromSymbol}`
                      : publicKey ? "Loading…" : "Available: —"}
                  </span>
                  <div className="flex gap-1">
                    {[25, 50, 75, 100].map(pct => (
                      <button
                        key={pct}
                        onClick={() => setPercent(pct)}
                        disabled={!balance || balance <= 0}
                        className="text-[10px] text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-full px-1.5 py-0.5 transition-colors disabled:opacity-30"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Flip — zero-height row so button straddles the boundary without pushing content */}
              <div className="relative h-0 z-10 flex justify-center overflow-visible">
                <button
                  onClick={flip}
                  className="absolute -translate-y-1/2 w-9 h-9 rounded-full bg-gray-900 border border-gray-700 hover:border-gray-500 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
                >
                  ↕
                </button>
              </div>

              {/* To — pt-7 ensures "You receive" label clears the flip button (36px ÷ 2 = 18px into panel) */}
              <div className="bg-gray-950 border border-gray-800 rounded-2xl px-4 pt-7 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-600">You receive</span>
                  <select
                    value={toSymbol}
                    onChange={(e) => { setToSymbol(e.target.value); setQuote(null); }}
                    className="bg-gray-900 text-xs text-white rounded-full px-2 py-1 outline-none border border-gray-700"
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
                    : <span className="text-gray-800">0</span>}
                </div>
              </div>
            </div>

            {/* Error — always above the CTA so it's never cut off */}
            {error && (
              <p className="text-red-400 text-xs px-1 py-1">{error}</p>
            )}

            {/* Quote details */}
            {quote && (
              <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Price impact</span>
                  <span className={priceImpact > 1 ? "text-red-400" : priceImpact > 0.3 ? "text-yellow-400" : "text-gray-400"}>
                    {priceImpact < 0.01 ? "<0.01" : priceImpact.toFixed(2)}%{priceImpact > 1 && " ⚠"}
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

            {!publicKey ? (
              <div className="text-center py-4">
                <p className="text-xs text-gray-600">Connect your wallet to swap</p>
              </div>
            ) : (
              <button
                onClick={executeSwap}
                disabled={!quote || swapping || quotePending}
                className="w-full bg-white text-black font-semibold py-3.5 rounded-full hover:bg-gray-100 disabled:opacity-40 transition-colors text-sm"
              >
                {swapping ? "Swapping…" : quotePending ? "Getting quote…" : quote ? `Swap ${fromSymbol} → ${toSymbol}` : "Enter an amount"}
              </button>
            )}

          </div>
        )}

      </div>
      <BottomNav />
    </main>
  );
}
