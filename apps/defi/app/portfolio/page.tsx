"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "../components/BottomNav";
import ChatPanel from "../components/ChatPanel";
import WalletButton from "../components/WalletButton";
import SOLDetailSheet from "../components/SOLDetailSheet";
import NativeStakeModal from "../components/NativeStakeModal";
import type { WalletData } from "../lib/types";

function TokenAvatar({ uri, label, initial }: { uri: string | null; label: string; initial: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
      {uri && !failed
        ? <img src={uri} alt={label} className="w-full h-full object-cover" onError={() => setFailed(true)} />
        : <span className="text-[10px] text-gray-500 font-medium">{initial}</span>
      }
    </div>
  );
}

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
  const perps = data.perpPositions ?? [];
  const perpCollateralUsd = perps.reduce((s, p) => s + p.collateralUsd, 0);
  const totalUsd = nativeSolUsd + kaminoUsd + data.stableUsd + data.otherUsd + jupStakedUsd + perpCollateralUsd;
  if (totalUsd === 0) return { totalUsd: 0, protocolScore: 0, concentrationScore: 0, derivativesScore: 0, opportunityScore: 0, riskScore: 0, riskLabel: "Low", riskColor: "text-green-400" };

  let protocolSum = 0;
  for (const p of data.kaminoPositions) protocolSum += p.netValueUsd * (RISK_WEIGHTS[p.type] ?? 0.3);
  protocolSum += data.stakedSOL * data.solPrice * 0.1 + data.idleSOL * data.solPrice * 0.05 + data.stableUsd * 0.02 + data.otherUsd * 0.15 + jupStakedUsd * 0.15;
  // Perps are protocol risk (liquidation possible) — weight by leverage
  for (const p of perps) protocolSum += p.collateralUsd * Math.min(1.0, 0.3 + (p.leverage - 1) * 0.1);
  const protocolScore = Math.min(100, Math.round((protocolSum / totalUsd) * 100));

  // Derivatives score: Kamino leverage + Jupiter perps
  const hasKaminoLev = data.kaminoPositions.some((p) => p.type === "multiply");
  const kaminoLevUsd = data.kaminoPositions.filter((p) => p.type === "multiply").reduce((s, p) => s + p.netValueUsd, 0);
  const hasPerps = perps.length > 0;
  // Liquidation proximity: ratio of (markPrice - liqPrice) / markPrice per position, weighted by size
  let liqProximityPenalty = 0;
  for (const p of perps) {
    if (p.markPrice > 0 && p.liquidationPrice > 0) {
      const distPct = p.side === "long"
        ? (p.markPrice - p.liquidationPrice) / p.markPrice
        : (p.liquidationPrice - p.markPrice) / p.markPrice;
      // < 10% from liquidation → very high penalty; < 20% → high; < 30% → moderate
      const penalty = distPct < 0.10 ? 40 : distPct < 0.20 ? 25 : distPct < 0.30 ? 10 : 5;
      liqProximityPenalty += penalty * (p.collateralUsd / totalUsd);
    }
  }
  const avgLeverage = perps.length > 0
    ? perps.reduce((s, p) => s + p.leverage * (p.collateralUsd / perpCollateralUsd), 0)
    : 0;
  const perpLevScore = hasPerps ? Math.min(100, Math.round(30 + avgLeverage * 8 + liqProximityPenalty)) : 0;
  const derivativesScore = Math.min(100, Math.round(
    (hasKaminoLev ? 50 + (kaminoLevUsd / totalUsd) * 50 : 0) * 0.5 +
    perpLevScore * 0.5
  ));

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
  const hasAnyLeverage = hasKaminoLev || hasPerps;
  const riskScore = hasAnyLeverage ? Math.max(41, rawScore) : rawScore;
  const riskLabel = riskScore <= 20 ? "Low" : riskScore <= 40 ? "Medium" : riskScore <= 65 ? "High" : "Very High";
  const riskColor = riskScore <= 20 ? "text-green-400" : riskScore <= 40 ? "text-yellow-400" : riskScore <= 65 ? "text-orange-400" : "text-red-400";

  return { totalUsd, protocolScore, concentrationScore, derivativesScore, opportunityScore, riskScore, riskLabel, riskColor };
}

export default function PortfolioPage() {
  const { publicKey } = useWallet();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [riskOpen, setRiskOpen] = useState(true);
  const [solSheetOpen, setSolSheetOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [nativeAPY, setNativeAPY] = useState(0.065);

  useEffect(() => {
    const address = publicKey?.toString() ?? (typeof window !== "undefined" ? localStorage.getItem("lastAddress") : null);
    if (!address) return;
    setLoading(true);
    fetch(`/api/wallet?address=${address}`)
      .then((r) => r.json())
      .then((json) => { if (!json.error) setData(json); })
      .finally(() => setLoading(false));
  }, [publicKey]);

  useEffect(() => {
    fetch("/api/yields")
      .then((r) => r.json())
      .then((yields: { label: string; apy: number }[]) => {
        const native = yields.find((y) => y.label === "Native Staking");
        if (native?.apy) setNativeAPY(native.apy / 100);
      })
      .catch(() => {});
  }, []);

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

          return (
            <div className="space-y-4 pb-4">

              {/* ── Total value + deployment bar ── */}
              {(() => {
                const idleStableUsd = (data.idleStables ?? []).reduce((s, x) => s + x.usd, 0);
                const perpCollateralUsd = (data.perpPositions ?? []).reduce((s, p) => s + p.collateralUsd, 0);
                // Three buckets: staked/earning | perps collateral | idle
                const stakedUsd = data.stakedSOL * data.solPrice + kaminoUsd + (data.stakedJup?.usd ?? 0) + (data.stableUsd - idleStableUsd);
                const idleUsd = data.idleSOL * data.solPrice + idleStableUsd;
                const t = totalUsd || 1;
                const stakedPct = (stakedUsd / t) * 100;
                const perpsPct = (perpCollateralUsd / t) * 100;
                const idlePct = (idleUsd / t) * 100;
                const fmt = (p: number) => p < 1 ? "<1%" : `${Math.round(p)}%`;
                const hasPerps = perpCollateralUsd > 0;
                const hasIdle = idleUsd > 0;
                return (
                  <div className="pt-2 pb-5 space-y-3">
                    <p className="text-5xl font-bold tracking-tight">{fmtUSD(totalUsd)}</p>

                    {/* 3-segment bar: staked | perps | idle */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-gray-600">Staked · Perps · Idle</p>
                      <div className="relative h-1.5 rounded-full overflow-hidden bg-gray-900">
                        <div className="absolute left-0 top-0 h-full bg-green-500"
                          style={{ width: `${stakedPct}%` }} />
                        {hasPerps && (
                          <div className="absolute top-0 h-full bg-violet-500"
                            style={{ left: `${stakedPct}%`, width: `${Math.max(perpsPct, 1.5)}%` }} />
                        )}
                        {hasIdle && (
                          <div className="absolute top-0 h-full bg-amber-500"
                            style={{ left: `${stakedPct + (hasPerps ? Math.max(perpsPct, 1.5) : 0)}%`, width: `${Math.max(idlePct, 1.5)}%` }} />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {data.stakedSOL > 0 && (
                          <span className="text-xs text-gray-600">Staked <span className="text-green-600">{fmtUSD(data.stakedSOL * data.solPrice)}</span></span>
                        )}
                        {kaminoUsd > 0 && (
                          <span className="text-xs text-gray-600">DeFi <span className="text-green-600">{fmtUSD(kaminoUsd)}</span></span>
                        )}
                        {(data.stakedJup?.usd ?? 0) > 0 && (
                          <span className="text-xs text-gray-600">JUP <span className="text-green-600">{fmtUSD(data.stakedJup.usd)}</span></span>
                        )}
                        {hasPerps && (
                          <span className="text-xs text-gray-600">Perps <span className="text-violet-400">{fmtUSD(perpCollateralUsd)} · {fmt(perpsPct)}</span></span>
                        )}
                        {data.idleSOL > 0.001 && (
                          <span className="text-xs text-gray-600">Idle <span className="text-amber-700">{fmtUSD(idleUsd)} · {fmt(idlePct)}</span></span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Divider ── */}
              <div className="h-px bg-gray-900" />

              {/* ── Risk analysis (tappable row) ── */}
              {(() => {
                const riskBadge = riskScore <= 20 ? "border-green-700 text-green-400"
                  : riskScore <= 40 ? "border-yellow-700 text-yellow-400"
                  : riskScore <= 65 ? "border-orange-700 text-orange-400"
                  : "border-red-700 text-red-400";
                return (
                  <div>
                    <button
                      onClick={() => setRiskOpen(o => !o)}
                      className="w-full flex items-center justify-between py-3 active:opacity-60 transition-opacity"
                    >
                      <span className="text-xs text-gray-600">Risk analysis</span>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block text-[10px] font-medium border rounded-full px-2 py-px ${riskBadge}`}>
                          {riskScore}/100 · {riskLabel}
                        </span>
                        <span className="text-gray-700 text-xs">{riskOpen ? "↑" : "↓"}</span>
                      </div>
                    </button>

                    {riskOpen && (
                      <div className="pb-3 space-y-3">
                        {[
                          { label: "Protocol Exposure", score: protocolScore, weight: "50%", desc: "Weighted by position type risk" },
                          { label: "Concentration", score: concentrationScore, weight: "30%", desc: "Spread across strategies" },
                          { label: "Derivatives / Leverage", score: derivativesScore, weight: "20%", desc: "Kamino multiply positions" },
                          { label: "Opportunity Readiness", score: opportunityScore, weight: "penalty", desc: "Liquid capital available to act" },
                        ].map(({ label, score, weight, desc }) => {
                          const barColor = score > 50 ? "#f97316" : score > 20 ? "#eab308" : "#22c55e";
                          const textColor = score > 50 ? "text-orange-400" : score > 20 ? "text-yellow-400" : "text-green-400";
                          return (
                            <div key={label} className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-400 leading-none">{label} <span className="text-gray-700">· {weight}</span></p>
                                <p className="text-xs text-gray-700 mt-0.5">{desc}</p>
                                <div className="mt-1.5 h-1 rounded-full bg-gray-900 overflow-hidden" style={{ maxWidth: 120 }}>
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(score, 100)}%`, background: barColor }} />
                                </div>
                              </div>
                              <span className={`text-xs font-medium shrink-0 tabular-nums ${textColor}`}>{score}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}


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

                      {/* SOL — tappable row opens SOLDetailSheet */}
                      {(data.stakedSOL > 0 || data.idleSOL > 0.001) && (() => {
                        const totalSOL = data.stakedSOL + data.idleSOL;
                        return (
                          <button
                            onClick={() => setSolSheetOpen(true)}
                            className="w-full px-4 py-3 text-left active:bg-gray-900 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                <TokenAvatar
                                  uri="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                                  label="SOL"
                                  initial="S"
                                />
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium">SOL</p>
                                  <span className="text-[10px] font-medium border border-gray-800 rounded-full px-1.5 py-0.5 text-gray-600">Details</span>
                                </div>
                              </div>
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
                          </button>
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

                      {/* Jupiter Perp Positions */}
                      {(data.perpPositions ?? []).map((p, i) => {
                        const pnlPositive = p.pnlUsd >= 0;
                        const tokenIcon = p.tokenSymbol === "SOL"
                          ? "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                          : p.tokenSymbol === "BTC"
                          ? "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHpQxNRtKFXJGTpq6BEfp/logo.png"
                          : null;
                        // Distance to liquidation as a % of mark price
                        const distToLiq = p.markPrice > 0 && p.liquidationPrice > 0
                          ? Math.abs(p.markPrice - p.liquidationPrice) / p.markPrice * 100
                          : null;
                        const liqWarning = distToLiq !== null && distToLiq < 20;
                        return (
                          <div key={i} className="flex items-center justify-between px-4 py-3 gap-3">
                            <div className="flex items-center gap-2.5">
                              <TokenAvatar uri={tokenIcon ?? null} label={p.tokenSymbol} initial={p.tokenSymbol[0]} />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium">{p.tokenSymbol} {p.side === "long" ? "Long" : "Short"}</p>
                                  <span className={`text-[10px] font-medium border rounded-full px-1.5 py-px ${p.side === "long" ? "text-green-400 border-green-900" : "text-red-400 border-red-900"}`}>
                                    {p.leverage.toFixed(1)}×
                                  </span>
                                </div>
                                <p className={`text-xs mt-0.5 ${liqWarning ? "text-red-500" : "text-gray-600"}`}>
                                  Liq {p.liquidationPrice > 0 ? `$${p.liquidationPrice.toFixed(2)}` : "—"}
                                  {distToLiq !== null && <span className={liqWarning ? " · ⚠ close" : ""}>{liqWarning ? "" : ` · ${distToLiq.toFixed(0)}% away`}</span>}
                                  {" · "}<a href="https://jup.ag/perps" target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-400">jup.ag ↗</a>
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">{fmtUSD(p.collateralUsd)}</p>
                              <p className={`text-xs mt-0.5 tabular-nums ${pnlPositive ? "text-green-500" : "text-red-400"}`}>
                                {pnlPositive ? "+" : ""}{fmtUSD(p.pnlUsd)} PnL
                              </p>
                            </div>
                          </div>
                        );
                      })}

                      {/* Staked JUP */}
                      {(data.stakedJup?.amount ?? 0) > 0.001 && (
                        <div className="flex items-center justify-between px-4 py-3 gap-3">
                          <div className="flex items-center gap-2.5">
                            <TokenAvatar uri="https://static.jup.ag/jup/icon.png" label="JUP" initial="J" />
                            <div>
                              <p className="text-sm font-medium">JUP</p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                Governance ·{" "}
                                <a href="https://vote.jup.ag" target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-400">vote.jup.ag ↗</a>
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{data.stakedJup.amount.toFixed(2)} JUP</p>
                            <p className="text-xs text-gray-600">{fmtUSD(data.stakedJup.usd)}</p>
                          </div>
                        </div>
                      )}

                      {/* Unstaking JUP */}
                      {(data.stakedJup?.unstakingAmount ?? 0) > 0.001 && (
                        <div className="flex items-center justify-between px-4 py-3 gap-3">
                          <div className="flex items-center gap-2.5">
                            <TokenAvatar uri="https://static.jup.ag/jup/icon.png" label="JUP" initial="J" />
                            <div>
                              <p className="text-sm font-medium">JUP</p>
                              <p className="text-xs text-yellow-700 mt-0.5">Unstaking · 7-day cooldown</p>
                            </div>
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
                              <TokenAvatar uri={t.logoURI} label={label} initial={initial} />
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
      {solSheetOpen && data && (
        <SOLDetailSheet
          data={data}
          nativeAPY={nativeAPY}
          onClose={() => setSolSheetOpen(false)}
          onStake={() => { setSolSheetOpen(false); setStakeOpen(true); }}
        />
      )}

      {stakeOpen && data && (
        <NativeStakeModal
          maxSOL={data.idleSOL}
          onClose={() => setStakeOpen(false)}
        />
      )}

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
          (data.perpPositions ?? []).length > 0
            ? `Jupiter Perp positions: ${data.perpPositions.map(p => `${p.tokenSymbol} ${p.side} ${p.leverage.toFixed(1)}x (collateral $${Math.round(p.collateralUsd)}, PnL $${p.pnlUsd.toFixed(2)}, liq $${p.liquidationPrice.toFixed(2)})`).join("; ")}`
            : "No open perp positions.",
          `Stake status: ${data.stakeStatus}`,
        ].join("\n") : ""}
      />
      <BottomNav />
    </main>
  );
}
