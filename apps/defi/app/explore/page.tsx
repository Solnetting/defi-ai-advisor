"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "../components/BottomNav";
import ChatPanel from "../components/ChatPanel";
import WalletButton from "../components/WalletButton";
import type { WalletData, YieldOption, StableYield } from "../lib/types";

function fmtTVL(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${Math.round(usd / 1e3)}K`;
}

function fmtSOL(sol: number): string {
  if (sol === 0) return "0";
  if (sol < 0.01) return sol.toFixed(4);
  if (sol < 1) return sol.toFixed(3);
  return sol.toFixed(2);
}

const RISK_COLOR: Record<string, string> = {
  "Very Low": "text-green-400",
  Low: "text-green-300",
  Medium: "text-yellow-400",
  "Medium–High": "text-orange-400",
  High: "text-red-400",
};

export default function ExplorePage() {
  const { publicKey } = useWallet();
  const [yields, setYields] = useState<YieldOption[]>([]);
  const [stableYields, setStableYields] = useState<Record<string, StableYield[]>>({});
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sol" | "stables">("sol");

  useEffect(() => {
    const address = publicKey?.toString() ?? (typeof window !== "undefined" ? localStorage.getItem("lastAddress") : null);

    Promise.all([
      fetch("/api/yields").then((r) => r.json()),
      fetch("/api/stable-yields").then((r) => r.json()),
      address ? fetch(`/api/wallet?address=${address}`).then((r) => r.json()) : Promise.resolve(null),
    ]).then(([yieldData, stableData, wData]) => {
      setYields(Array.isArray(yieldData) ? yieldData : []);
      if (stableData && typeof stableData === "object" && !stableData.error) {
        setStableYields(stableData as Record<string, StableYield[]>);
      }
      if (wData && !wData.error) {
        setWalletData(wData);
      }
    }).finally(() => setLoading(false));
  }, [publicKey]);

  const hasStables = walletData && (walletData.idleStables ?? []).length > 0;
  const idleSOL = walletData?.idleSOL ?? 0;
  const solPrice = walletData?.solPrice ?? 0;

  return (
    <main className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-2">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-bold">Explore Yields</h1>
            <p className="text-xs text-gray-600 mt-0.5">Live APY · ranked by return</p>
          </div>
          <WalletButton />
        </div>

        {/* Tabs */}
        {hasStables && (
          <div className="flex gap-1 mb-4 bg-gray-950 border border-gray-800 rounded-lg p-1">
            {(["sol", "stables"] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === t ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
                }`}>
                {t === "sol" ? "SOL Staking" : "Stablecoins"}
              </button>
            ))}
          </div>
        )}

        {loading && <p className="text-gray-600 text-sm">Fetching live yields…</p>}

        {/* SOL staking yields */}
        {(!hasStables || activeTab === "sol") && !loading && (
          <div className="space-y-4">
            {idleSOL > 0.001 && (
              <div className="bg-gray-950 border border-yellow-900/40 rounded-xl px-4 py-3">
                <p className="text-xs text-yellow-600">
                  You have <span className="text-yellow-400 font-medium">{fmtSOL(idleSOL)} SOL idle</span>
                  {solPrice > 0 ? ` · $${Math.round(idleSOL * solPrice).toLocaleString()} not earning` : ""}
                </p>
              </div>
            )}

            <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
              <p className="text-xs text-gray-600 px-4 pt-3 pb-2 border-b border-gray-900">SOL Staking Options</p>
              <div className="divide-y divide-gray-900">
                {yields.map((y) => {
                  const yearlySOL = idleSOL > 0.001 ? idleSOL * (y.apy / 100) : null;
                  return (
                    <div key={y.label} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{y.label}</p>
                            <span className={`text-xs ${RISK_COLOR[y.risk] ?? "text-gray-400"}`}>{y.risk}</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{y.liquidity} · TVL {fmtTVL(y.tvlUsd)}</p>
                          {yearlySOL && (
                            <p className="text-xs text-yellow-600 mt-1">
                              +{yearlySOL.toFixed(3)} SOL/yr on your idle
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-bold text-white">{y.apy.toFixed(2)}%</p>
                          <a href={y.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                            Stake ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Stablecoin yields */}
        {hasStables && activeTab === "stables" && !loading && (
          <div className="space-y-4">
            {(walletData?.idleStables ?? []).map((stable) => {
              const options = stableYields[stable.symbol] ?? [];
              return (
                <div key={stable.mint} className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-900">
                    <p className="text-xs text-gray-400 font-medium">{stable.symbol}</p>
                    <p className="text-xs text-gray-600">${stable.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} idle</p>
                  </div>
                  {options.length === 0 && (
                    <p className="text-xs text-gray-700 px-4 py-3">No yield data available</p>
                  )}
                  <div className="divide-y divide-gray-900">
                    {options.slice(0, 5).map((opt) => {
                      const yearlyUsd = stable.usd * (opt.apy / 100);
                      return (
                        <div key={opt.protocol} className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{opt.protocol}</p>
                              <span className={`text-xs ${RISK_COLOR[opt.risk] ?? "text-gray-400"}`}>{opt.risk}</span>
                            </div>
                            <p className="text-xs text-gray-600 mt-0.5">TVL {fmtTVL(opt.tvlUsd)}</p>
                            {yearlyUsd >= 0.01 && (
                              <p className="text-xs text-green-700 mt-1">
                                +${yearlyUsd < 10 ? yearlyUsd.toFixed(2) : Math.round(yearlyUsd).toLocaleString()}/yr
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-bold">{opt.apy.toFixed(2)}%</p>
                            <a href={opt.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                              Deploy ↗
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
      <ChatPanel
        mode="inline"
        placeholder="Compare protocols, ask about risk or APY…"
        context={[
          yields.length > 0
            ? `Live SOL staking yields: ${yields.map(y => `${y.label} ${y.apy.toFixed(2)}% APY (${y.risk} risk)`).join(", ")}`
            : "",
          walletData && walletData.idleSOL > 0.001
            ? `User has ${walletData.idleSOL.toFixed(3)} idle SOL at $${walletData.solPrice}/SOL.`
            : "",
          walletData && (walletData.idleStables ?? []).length > 0
            ? `User holds idle stablecoins: ${(walletData.idleStables ?? []).map(s => `${s.symbol} $${Math.round(s.usd)}`).join(", ")}.`
            : "",
        ].filter(Boolean).join("\n")}
      />
      <BottomNav />
    </main>
  );
}
