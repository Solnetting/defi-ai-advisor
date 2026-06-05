"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "../components/BottomNav";
import type { WalletData } from "../lib/types";

function fmtUSD(usd: number): string {
  if (usd === 0) return "$0";
  if (Math.abs(usd) < 0.01) return "<$0.01";
  if (Math.abs(usd) < 10) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString()}`;
}

function fmtSOL(sol: number): string {
  if (sol === 0) return "0";
  if (sol < 0.0001) return sol.toFixed(6);
  if (sol < 0.01) return sol.toFixed(4);
  if (sol < 1) return sol.toFixed(3);
  return sol.toFixed(2);
}

const RISK_WEIGHTS: Record<string, number> = {
  multiply: 1.0, liquidity: 0.6, lending: 0.5, earn: 0.3,
};

function computeRisk(data: WalletData) {
  const kaminoUsd = data.kaminoPositions.reduce((s, p) => s + p.netValueUsd, 0);
  const nativeSolUsd = (data.idleSOL + data.stakedSOL) * data.solPrice;
  const totalUsd = nativeSolUsd + kaminoUsd + data.stableUsd + data.otherUsd;
  if (totalUsd === 0) return { totalUsd: 0, protocolScore: 0, concentrationScore: 0, derivativesScore: 0, opportunityScore: 0, riskScore: 0, riskLabel: "Low", riskColor: "text-green-400" };

  let protocolSum = 0;
  for (const p of data.kaminoPositions) protocolSum += p.netValueUsd * (RISK_WEIGHTS[p.type] ?? 0.3);
  protocolSum += data.stakedSOL * data.solPrice * 0.1 + data.idleSOL * data.solPrice * 0.05 + data.stableUsd * 0.02 + data.otherUsd * 0.15;
  const protocolScore = Math.min(100, Math.round((protocolSum / totalUsd) * 100));

  const hasLeverage = data.kaminoPositions.some((p) => p.type === "multiply");
  const leverageUsdAmt = data.kaminoPositions.filter((p) => p.type === "multiply").reduce((s, p) => s + p.netValueUsd, 0);
  const derivativesScore = hasLeverage ? Math.min(100, Math.round(50 + (leverageUsdAmt / totalUsd) * 50)) : 0;

  const defiTypes = new Set(data.kaminoPositions.map((p) => p.type));
  const hasDeFi = kaminoUsd / totalUsd > 0.2;
  const stablePct = (data.stableUsd / totalUsd) * 100;
  let concentrationScore = 0;
  if (hasDeFi) concentrationScore += defiTypes.size === 1 ? 40 : defiTypes.size === 2 ? 20 : 0;
  if (stablePct > 40) concentrationScore -= 35;
  else if (stablePct > 20) concentrationScore -= 20;
  concentrationScore = Math.max(0, Math.min(100, concentrationScore));

  const dryPowderPct = ((data.idleSOL * data.solPrice + data.stableUsd) / totalUsd) * 100;
  const opportunityScore = dryPowderPct < 1 ? 10 : dryPowderPct < 5 ? 5 : 0;

  const rawScore = Math.round(protocolScore * 0.5 + concentrationScore * 0.3 + derivativesScore * 0.2 + opportunityScore);
  const riskScore = hasLeverage ? Math.max(41, rawScore) : rawScore;
  const riskLabel = riskScore <= 20 ? "Low" : riskScore <= 40 ? "Medium" : riskScore <= 65 ? "High" : "Very High";
  const riskColor = riskScore <= 20 ? "text-green-400" : riskScore <= 40 ? "text-yellow-400" : riskScore <= 65 ? "text-orange-400" : "text-red-400";

  return { totalUsd, protocolScore, concentrationScore, derivativesScore, opportunityScore, riskScore, riskLabel, riskColor };
}

export default function PortfolioPage() {
  const { publicKey } = useWallet();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAllTokens, setShowAllTokens] = useState(false);

  useEffect(() => {
    const address = publicKey?.toString() ?? (typeof window !== "undefined" ? localStorage.getItem("lastAddress") : null);
    if (!address) return;
    setLoading(true);
    fetch(`/api/wallet?address=${address}`)
      .then((r) => r.json())
      .then((json) => { if (!json.error) setData(json); })
      .finally(() => setLoading(false));
  }, [publicKey]);

  return (
    <main className="h-dvh flex flex-col bg-black text-white max-w-lg mx-auto overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-2">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold">Portfolio</h1>
          {data && (
            <p className="text-xs text-gray-600 mt-0.5 font-mono">
              {(publicKey?.toString() ?? localStorage.getItem("lastAddress") ?? "").slice(0, 6)}…
              {(publicKey?.toString() ?? localStorage.getItem("lastAddress") ?? "").slice(-4)}
            </p>
          )}
        </div>

        {loading && <p className="text-gray-600 text-sm">Loading portfolio…</p>}

        {!data && !loading && (
          <div className="text-center py-20 space-y-2">
            <p className="text-gray-600 text-sm">No wallet connected</p>
            <p className="text-gray-700 text-xs">Connect your wallet or analyze an address from Home</p>
          </div>
        )}

        {data && (() => {
          const { totalUsd, protocolScore, concentrationScore, derivativesScore, opportunityScore, riskScore, riskLabel, riskColor } = computeRisk(data);
          const kaminoUsd = data.kaminoPositions.reduce((s, p) => s + p.netValueUsd, 0);
          const nativeSolUsd = (data.idleSOL + data.stakedSOL) * data.solPrice;

          return (
            <div className="space-y-4 pb-4">

              {/* ── Total value ── */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 space-y-3">
                <p className="text-3xl font-bold">{fmtUSD(totalUsd)}</p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { label: "SOL", value: fmtUSD(nativeSolUsd) },
                    { label: "DeFi", value: fmtUSD(kaminoUsd) },
                    { label: "Stables", value: fmtUSD(data.stableUsd) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-900 rounded-lg px-3 py-2.5">
                      <p className="text-xs text-gray-600 mb-1">{label}</p>
                      <p className="text-sm font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Risk analysis ── */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Risk Analysis</span>
                  <span className={`text-sm font-bold ${riskColor}`}>{riskLabel} · {riskScore}/100</span>
                </div>

                {/* Spectrum bar */}
                <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)" }}>
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-gray-900 shadow"
                    style={{ left: `calc(${Math.min(riskScore, 99)}% - 6px)` }} />
                </div>

                {/* Components */}
                <div className="space-y-2 pt-1">
                  {[
                    { label: "Protocol Exposure", score: protocolScore, weight: "50%", desc: "Weighted by position type risk" },
                    { label: "Concentration", score: concentrationScore, weight: "30%", desc: "Spread across strategies" },
                    { label: "Derivatives / Leverage", score: derivativesScore, weight: "20%", desc: "Kamino multiply positions" },
                    { label: "Opportunity Readiness", score: opportunityScore, weight: "penalty", desc: "Liquid capital available to act" },
                  ].map(({ label, score, weight, desc }) => (
                    <div key={label} className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 leading-none">{label} <span className="text-gray-700">· {weight}</span></p>
                        <p className="text-xs text-gray-700 mt-0.5">{desc}</p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${score > 50 ? "text-orange-400" : score > 20 ? "text-yellow-400" : "text-green-400"}`}>
                        {score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Positions ── */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                <p className="text-xs text-gray-600 px-4 pt-3 pb-2 border-b border-gray-900">Positions</p>
                <div className="divide-y divide-gray-900">

                  {/* Staked SOL */}
                  {data.stakedSOL > 0 && (
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">Staked SOL</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {data.stakeStatus}{data.stakeStatus === "Activating" && data.epochHoursRemaining > 0 ? ` · ~${data.epochHoursRemaining}h remaining` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{fmtSOL(data.stakedSOL)} SOL</p>
                        <p className="text-xs text-gray-600">{fmtUSD(data.stakedSOL * data.solPrice)}</p>
                      </div>
                    </div>
                  )}

                  {/* Idle SOL */}
                  {data.idleSOL > 0.001 && (
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">Idle SOL</p>
                        <p className="text-xs text-yellow-700 mt-0.5">Not earning yield</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{fmtSOL(data.idleSOL)} SOL</p>
                        <p className="text-xs text-gray-600">{fmtUSD(data.idleSOL * data.solPrice)}</p>
                      </div>
                    </div>
                  )}

                  {/* Kamino positions */}
                  {data.kaminoPositions.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-gray-600 mt-0.5 capitalize">
                          {p.type}{p.apy != null ? ` · ${p.apy}% APY` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{fmtUSD(p.netValueUsd)}</p>
                        {p.amountSOL > 0 && <p className="text-xs text-gray-600">{fmtSOL(p.amountSOL)} SOL</p>}
                      </div>
                    </div>
                  ))}

                  {/* Idle stables */}
                  {(data.idleStables ?? []).map((s) => (
                    <div key={s.mint} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{s.symbol}</p>
                        <p className="text-xs text-yellow-700 mt-0.5">Idle — not earning yield</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{fmtUSD(s.usd)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Token list ── */}
              {data.tokens.length > 0 && (
                <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                  <p className="text-xs text-gray-600 px-4 pt-3 pb-2 border-b border-gray-900">
                    Other tokens ({data.tokens.length})
                  </p>
                  <div className="divide-y divide-gray-900">
                    {(showAllTokens ? data.tokens : data.tokens.slice(0, 6)).map((t) => (
                      <div key={t.mint} className="flex items-center justify-between px-4 py-2.5">
                        <p className="text-sm text-gray-400">{t.symbol ?? t.name ?? t.mint.slice(0, 8)}</p>
                        <p className="text-sm text-gray-500">
                          {(t.amount / Math.pow(10, t.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </p>
                      </div>
                    ))}
                  </div>
                  {data.tokens.length > 6 && (
                    <button onClick={() => setShowAllTokens(!showAllTokens)}
                      className="w-full py-2.5 text-xs text-gray-700 hover:text-gray-500 transition-colors border-t border-gray-900">
                      {showAllTokens ? "Show less" : `Show ${data.tokens.length - 6} more`}
                    </button>
                  )}
                </div>
              )}

            </div>
          );
        })()}

      </div>
      <BottomNav />
    </main>
  );
}
