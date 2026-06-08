"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "../components/BottomNav";
import ChatPanel from "../components/ChatPanel";
import WalletButton from "../components/WalletButton";
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
  return sol.toFixed(3);
}

const RISK_WEIGHTS: Record<string, number> = {
  multiply: 1.0, liquidity: 0.6, lending: 0.5, earn: 0.3,
};

function computeRisk(data: WalletData) {
  const kaminoUsd = data.kaminoPositions.reduce((s, p) => s + p.netValueUsd, 0);
  const nativeSolUsd = (data.idleSOL + data.stakedSOL) * data.solPrice;
  const jupStakedUsd = (data.stakedJup?.usd ?? 0) + (data.stakedJup?.unstakingAmount ?? 0) * (data.stakedJup?.jupPrice ?? 0);
  const totalUsd = nativeSolUsd + kaminoUsd + data.stableUsd + data.otherUsd + jupStakedUsd;
  if (totalUsd === 0) return { totalUsd: 0, protocolScore: 0, concentrationScore: 0, derivativesScore: 0, opportunityScore: 0, riskScore: 0, riskLabel: "Low", riskColor: "text-green-400" };

  let protocolSum = 0;
  for (const p of data.kaminoPositions) protocolSum += p.netValueUsd * (RISK_WEIGHTS[p.type] ?? 0.3);
  // Staked JUP: governance lock with token price risk, no liquidation risk → weight 0.15
  protocolSum += data.stakedSOL * data.solPrice * 0.1 + data.idleSOL * data.solPrice * 0.05 + data.stableUsd * 0.02 + data.otherUsd * 0.15 + jupStakedUsd * 0.15;
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
  const [riskOpen, setRiskOpen] = useState(false);
  const [effOpen, setEffOpen] = useState(false);

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
    <main className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-2">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold">Portfolio</h1>
          <WalletButton />
        </div>

        {loading && (
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-purple-600 text-xs">✦</span>
              <span className="text-xs text-purple-700">AI Analyzing portfolio…</span>
            </div>
            {/* Value card */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="h-12 w-36 bg-gray-900 rounded-lg" />
              <div className="space-y-2 pt-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between">
                    <div className="h-4 w-24 bg-gray-900 rounded" />
                    <div className="h-4 w-20 bg-gray-900 rounded" />
                  </div>
                ))}
              </div>
            </div>
            {/* Risk card */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 flex justify-between items-center">
              <div className="h-4 w-28 bg-gray-900 rounded" />
              <div className="h-4 w-20 bg-gray-900 rounded" />
            </div>
            {/* Assets card */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-900">
                <div className="h-3 w-12 bg-gray-900 rounded" />
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between items-center px-4 py-3 border-b border-gray-900 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-900" />
                    <div className="h-4 w-20 bg-gray-900 rounded" />
                  </div>
                  <div className="h-4 w-16 bg-gray-900 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

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
          const effScore = Math.max(0, 100 - riskScore);
          const effLabel = effScore >= 80 ? "Excellent" : effScore >= 60 ? "Good" : effScore >= 40 ? "Fair" : "Low";

          return (
            <div className="space-y-4 pb-4">

              {/* ── Total value ── */}
              <div className="pt-2 pb-4">
                <p className="text-5xl font-bold tracking-tight">{fmtUSD(totalUsd)}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {data.stakedSOL > 0 && (
                    <span className="text-xs text-gray-600">
                      Staked <span className="text-gray-400">{fmtUSD(data.stakedSOL * data.solPrice)}</span>
                    </span>
                  )}
                  {data.idleSOL > 0.001 && (
                    <span className="text-xs text-yellow-800">
                      Idle SOL <span className="text-yellow-700">{fmtUSD(data.idleSOL * data.solPrice)}</span>
                    </span>
                  )}
                  {kaminoUsd > 0 && (
                    <span className="text-xs text-gray-600">
                      DeFi <span className="text-gray-400">{fmtUSD(kaminoUsd)}</span>
                    </span>
                  )}
                  {(data.stakedJup?.usd ?? 0) > 0 && (
                    <span className="text-xs text-gray-600">
                      JUP <span className="text-gray-400">{fmtUSD(data.stakedJup.usd)}</span>
                    </span>
                  )}
                  {data.stableUsd > 0 && (
                    <span className="text-xs text-gray-600">
                      Stables <span className="text-gray-400">{fmtUSD(data.stableUsd)}</span>
                    </span>
                  )}
                  {data.otherUsd > 0 && (
                    <span className="text-xs text-gray-600">
                      Other <span className="text-gray-400">{fmtUSD(data.otherUsd)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* ── Risk analysis (collapsible) ── */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setRiskOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold">Risk Analysis</span>
                  <div className="flex items-center gap-3">
                    {/* Mini spectrum bar */}
                    <div className="relative w-14 h-1.5 rounded-full overflow-hidden" style={{ background: "linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)" }}>
                      <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-900"
                        style={{ left: `calc(${Math.min(riskScore, 99)}% - 5px)` }} />
                    </div>
                    <span className={`text-sm font-bold ${riskColor}`}>{riskScore}/100 · {riskLabel}</span>
                    <span className="text-gray-600 text-xs">{riskOpen ? "↑" : "↓"}</span>
                  </div>
                </button>

                {riskOpen && (
                  <div className="border-t border-gray-900 px-4 py-3 space-y-3">
                    {/* Full spectrum bar */}
                    <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)" }}>
                      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-gray-900 shadow"
                        style={{ left: `calc(${Math.min(riskScore, 99)}% - 6px)` }} />
                    </div>
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
                )}
              </div>

              {/* ── Efficiency (collapsible) ── */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setEffOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold">Efficiency</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">{effScore}/100 · {effLabel}</span>
                    <span className="text-gray-600 text-xs">{effOpen ? "↑" : "↓"}</span>
                  </div>
                </button>
                {effOpen && (
                  <div className="border-t border-gray-900 px-4 py-3">
                    <p className="text-xs text-gray-600 leading-relaxed">
                      100 minus risk score. Measures how much of your portfolio is actively earning vs. sitting idle or in high-risk positions. Higher is better.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Assets (unified — SOL + positions + all tokens) ── */}
              {(() => {
                // Stablecoins already in data.tokens — do not show idle stables separately.
                // All assets in one list: staked SOL → idle SOL → Kamino → JUP → tokens.
                const stableMints = new Set((data.idleStables ?? []).map(s => s.mint));
                const allTokenCount = data.tokens.length;
                const visibleTokens = showAllTokens ? data.tokens : data.tokens.slice(0, 6);

                return (
                  <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                    <p className="text-xs text-gray-600 px-4 pt-3 pb-2 border-b border-gray-900">Assets</p>
                    <div className="divide-y divide-gray-900">

                      {/* SOL — single row, staked+idle breakdown below */}
                      {(data.stakedSOL > 0 || data.idleSOL > 0.001) && (() => {
                        const totalSOL = data.stakedSOL + data.idleSOL;
                        return (
                          <div className="px-4 py-3">
                            <div className="flex items-start justify-between">
                              <p className="text-sm font-medium">SOL</p>
                              <div className="text-right">
                                <p className="text-sm font-medium">{fmtSOL(totalSOL)} SOL</p>
                                <p className="text-xs text-gray-600">{fmtUSD(totalSOL * data.solPrice)}</p>
                              </div>
                            </div>
                            <div className="mt-2 space-y-1">
                              {data.stakedSOL > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">
                                    Staked · {data.stakeStatus}{data.stakeStatus === "Activating" && data.epochHoursRemaining > 0 ? ` · ~${data.epochHoursRemaining}h` : ""}
                                  </span>
                                  <span className="text-xs text-gray-500">{fmtSOL(data.stakedSOL)} SOL</span>
                                </div>
                              )}
                              {data.idleSOL > 0.001 && (
                                <div className="flex justify-between">
                                  <span className="text-xs text-yellow-800">Idle · not earning</span>
                                  <span className="text-xs text-yellow-800">{fmtSOL(data.idleSOL)} SOL</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Kamino positions */}
                      {data.kaminoPositions.map((p, i) => {
                        const isGeneric = p.name.toLowerCase() === p.type.toLowerCase();
                        return (
                          <div key={i} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <p className="text-sm font-medium capitalize">
                                {isGeneric ? `Kamino ${p.type}${p.tokenSymbol ? ` · ${p.tokenSymbol}` : ""}` : p.name}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5 capitalize">
                                {p.type}{p.apy != null ? ` · ${p.apy}% APY` : ""}
                                {(isGeneric || p.apy == null) && (
                                  <a href="https://app.kamino.finance" target="_blank" rel="noreferrer"
                                    className="ml-1.5 text-gray-500 hover:text-gray-400 not-italic normal-case">↗</a>
                                )}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">{fmtUSD(p.netValueUsd)}</p>
                              {p.amountSOL > 0 && <p className="text-xs text-gray-600">{fmtSOL(p.amountSOL)} SOL</p>}
                            </div>
                          </div>
                        );
                      })}

                      {/* Staked JUP */}
                      {(data.stakedJup?.amount ?? 0) > 0.001 && (
                        <div className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-sm font-medium">JUP</p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              Governance ·{" "}
                              <a href="https://vote.jup.ag" target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-400">vote.jup.ag ↗</a>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{data.stakedJup.amount.toFixed(2)} JUP</p>
                            <p className="text-xs text-gray-600">{fmtUSD(data.stakedJup.usd)}</p>
                          </div>
                        </div>
                      )}

                      {/* Unstaking JUP */}
                      {(data.stakedJup?.unstakingAmount ?? 0) > 0.001 && (
                        <div className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-sm font-medium">JUP</p>
                            <p className="text-xs text-yellow-700 mt-0.5">Unstaking · 7-day cooldown</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{data.stakedJup.unstakingAmount.toFixed(2)} JUP</p>
                            <p className="text-xs text-gray-600">{fmtUSD(data.stakedJup.unstakingAmount * data.stakedJup.jupPrice)}</p>
                          </div>
                        </div>
                      )}

                      {/* All tokens (includes USDC/stables — no separate idle-stables section to avoid duplication) */}
                      {visibleTokens.map((t) => {
                        const label = t.symbol ?? t.name ?? t.mint.slice(0, 8);
                        const initial = label[0]?.toUpperCase() ?? "?";
                        const isIdle = stableMints.has(t.mint);
                        return (
                          <div key={t.mint} className="flex items-center justify-between px-4 py-2.5 gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                                {t.logoURI ? (
                                  <img src={t.logoURI} alt={label} className="w-full h-full object-cover"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                ) : (
                                  <span className="text-[10px] text-gray-500 font-medium">{initial}</span>
                                )}
                              </div>
                              <div>
                                <p className="text-sm text-gray-300">{label}</p>
                                {isIdle && <p className="text-xs text-yellow-700">Idle · not earning</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              {t.usdValue >= 0.01 && <p className="text-sm tabular-nums">{fmtUSD(t.usdValue)}</p>}
                              <p className="text-xs text-gray-600 tabular-nums">
                                {(t.amount / Math.pow(10, t.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {allTokenCount > 6 && (
                      <button onClick={() => setShowAllTokens(!showAllTokens)}
                        className="w-full py-2.5 text-xs text-gray-700 hover:text-gray-500 transition-colors border-t border-gray-900">
                        {showAllTokens ? "Show less" : `Show ${allTokenCount - 6} more`}
                      </button>
                    )}
                  </div>
                );
              })()}

            </div>
          );
        })()}

      </div>
      <ChatPanel
        placeholder="Ask about your risk, positions, or strategy…"
        context={data ? [
          `SOL price: $${data.solPrice}`,
          `Staked SOL: ${data.stakedSOL} SOL ($${Math.round(data.stakedSOL * data.solPrice)})`,
          `Idle SOL: ${data.idleSOL} SOL ($${Math.round(data.idleSOL * data.solPrice)})`,
          data.kaminoPositions.length > 0
            ? `Kamino positions: ${data.kaminoPositions.map(p => `${p.name} (${p.type}, $${Math.round(p.netValueUsd)}${p.apy ? `, ${p.apy}% APY` : ""})`).join("; ")}`
            : "No Kamino positions.",
          data.stableUsd > 0
            ? `Idle stablecoins: ${(data.idleStables ?? []).map(s => `${s.symbol} $${Math.round(s.usd)}`).join(", ")}`
            : "No idle stablecoins.",
          `Stake status: ${data.stakeStatus}`,
        ].join("\n") : ""}
      />
      <BottomNav />
    </main>
  );
}
