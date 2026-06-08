"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import WalletButton from "./components/WalletButton";
import NativeStakeModal from "./components/NativeStakeModal";
import StableYieldModal from "./components/StableYieldModal";
import SwapModal from "./components/SwapModal";
import BottomNav from "./components/BottomNav";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";

interface YieldOption {
  label: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: string;
  liquidity: string;
  url: string;
}

interface Token {
  mint: string;
  amount: number;
  decimals: number;
  name: string | null;
  symbol: string | null;
}

interface KaminoPosition {
  name: string;
  type: string;
  tokenSymbol: string | null;
  amountSOL: number;
  netValueUsd: number;
  apy: number | null;
}

interface IdleStable {
  symbol: string;
  mint: string;
  usd: number;
}

interface StableYield {
  protocol: string;
  apy: number;
  risk: string;
  url: string;
  tvlUsd: number;
}

interface WalletData {
  solBalance: number;
  stakedSOL: number;
  stakeStatus: string;
  kaminoSOL: number;
  idleSOL: number;
  solPrice: number;
  solPrice24hChange: number;
  epochHoursRemaining: number;
  kaminoPositions: KaminoPosition[];
  tokens: Token[];
  stableUsd: number;
  otherUsd: number;
  idleStables: IdleStable[];
  stakedJup: { amount: number; usd: number; unstakingAmount: number; jupPrice: number };
  error?: string;
}

const SCENARIO_COLORS = ["#a855f7", "#60a5fa", "#f472b6", "#2dd4bf", "#fb923c"];

// Never round small amounts to zero
function fmtSOL(sol: number): string {
  if (sol === 0) return "0";
  if (sol < 0.0001) return sol.toFixed(6);
  if (sol < 0.01) return sol.toFixed(4);
  if (sol < 1) return sol.toFixed(3);
  return sol.toFixed(3);
}
function fmtUSD(usd: number): string {
  if (usd === 0) return "$0";
  if (Math.abs(usd) < 0.01) return "<$0.01";
  if (Math.abs(usd) < 10) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString()}`;
}


export default function Home() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [address, setAddress] = useState("");
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [timeframe, setTimeframe] = useState<"1Y" | "3Y" | "5Y">("1Y");
  const [yields, setYields] = useState<YieldOption[]>([]);
  const [stableYields, setStableYields] = useState<Record<string, StableYield[]>>({});
  const [stakeModalOpen, setStakeModalOpen] = useState(false);
  const [stableModal, setStableModal] = useState<{ symbol: string; idleUsd: number } | null>(null);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0);
  const [swapOpen, setSwapOpen] = useState(false);
  const planTouchX = useRef(0);
  const planDir = useRef(1);
  const [forecastScenarios, setForecastScenarios] = useState<Array<{
    id: string;
    type: "price" | "contribution";
    targetPrice?: number;
    solPerMonth?: number;
    targetMonths: number;
    label: string;
    color: string;
  }>>([]);


useEffect(() => {
    if (connected && publicKey) {
      const addr = publicKey.toBase58();
      setAddress(addr);
      analyze(addr);
    }
  }, [connected, publicKey]);

  useEffect(() => {
    fetch("/api/yields").then((r) => r.json()).then((d) => Array.isArray(d) && setYields(d));
    fetch("/api/stable-yields").then((r) => r.json()).then((d) => d && !d.error && setStableYields(d));
  }, []);

  async function analyze(addr?: string) {
    const target = addr ?? address.trim();
    if (!target) return;
    setLoading(true);
    setError("");
    setData(null);
    setCurrentPlanIndex(0);
    try {
      const res = await fetch(`/api/wallet?address=${target}`);
      const json = await res.json();
      if (json.error) setError(json.error);
      else {
        setData(json);
        localStorage.setItem("lastAddress", target);
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Chat send handler — passed to ChatPanel as onSend
  async function handleChatSend(q: string, messages: ChatMessage[]): Promise<ChatMessage> {
    if (!data) return { role: "assistant", content: "Connect your wallet first." };

    const now = new Date();
    const bestAPY = yields.find((y) => y.label === "Native Staking")?.apy ?? 5.65;
    const nativeAPY = bestAPY / 100;
    const stakedBase = data.stakedSOL + data.kaminoSOL;
    const projBase = stakedBase < 0.001 ? data.idleSOL : stakedBase;

    // 1. Try chart scenario classification
    if (forecastScenarios.length < 5) {
      try {
        const fRes = await fetch("/api/forecast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, currentPrice: data.solPrice, currentDate: now.toISOString().slice(0, 10), currentSOL: projBase }),
        });
        const fResult = await fRes.json();

        if (fResult.targetPrice != null || fResult.solPerMonth != null) {
          const newScenario = {
            ...fResult,
            id: `${Date.now()}`,
            color: SCENARIO_COLORS[forecastScenarios.length % SCENARIO_COLORS.length],
          };
          setForecastScenarios((prev) => [...prev, newScenario]);

          let content: string;
          if (fResult.type === "price" && fResult.targetPrice != null) {
            const projSOL = projBase * Math.pow(1 + nativeAPY, fResult.targetMonths / 12);
            content = `At $${fResult.targetPrice.toLocaleString()}/SOL, your ${fmtSOL(projSOL)} staked SOL = ${fmtUSD(projSOL * fResult.targetPrice)}. Chart updated above.`;
          } else {
            const months = fResult.targetMonths;
            const finalSOL = Math.max(0, (projBase + months * fResult.solPerMonth) * Math.pow(1 + nativeAPY, months / 12));
            const isSell = fResult.solPerMonth < 0;
            const soldSOL = Math.abs(fResult.solPerMonth * months);
            content = isSell
              ? `Selling ~${fmtSOL(soldSOL)} SOL over ${months} months → ${fmtSOL(finalSOL)} SOL remaining · ${fmtUSD(finalSOL * data.solPrice)}. Chart updated above.`
              : `Adding ${fResult.solPerMonth} SOL/month for ${months} months → ${fmtSOL(finalSOL)} SOL · ${fmtUSD(finalSOL * data.solPrice)}. Chart updated above.`;
          }
          return { role: "assistant", content, color: newScenario.color };
        }
      } catch { /* fall through to /api/chat */ }
    }

    // 2. General question → /api/chat
    const idleStablesCtx = (data.idleStables ?? [])
      .map((s) => { const best = stableYields[s.symbol]?.[0]; return `${s.symbol} $${s.usd.toLocaleString()} idle${best ? ` (best: ${best.apy}% on ${best.protocol} · source: DeFiLlama)` : ""}`; })
      .join(", ");
    const kaminoUsdCtx = data.kaminoPositions.reduce((s, p) => s + p.netValueUsd, 0);
    const totalUsdCtx = (data.idleSOL + data.stakedSOL) * data.solPrice + kaminoUsdCtx + data.stableUsd + data.otherUsd;
    const RISK_W: Record<string, number> = { multiply: 1.0, liquidity: 0.6, lending: 0.5, earn: 0.3 };
    let protocolSumCtx = 0;
    for (const p of data.kaminoPositions) protocolSumCtx += p.netValueUsd * (RISK_W[p.type] ?? 0.3);
    protocolSumCtx += data.stakedSOL * data.solPrice * 0.1 + data.idleSOL * data.solPrice * 0.05 + data.stableUsd * 0.02 + data.otherUsd * 0.15;
    const protocolScoreCtx = totalUsdCtx > 0 ? Math.min(100, Math.round((protocolSumCtx / totalUsdCtx) * 100)) : 0;
    const hasLeverageCtx = data.kaminoPositions.some((p) => p.type === "multiply");
    const leverageUsdCtx = data.kaminoPositions.filter((p) => p.type === "multiply").reduce((s, p) => s + p.netValueUsd, 0);
    const derivScoreCtx = hasLeverageCtx ? Math.min(100, Math.round(50 + (leverageUsdCtx / (totalUsdCtx || 1)) * 50)) : 0;
    const defiTypesCtx = new Set(data.kaminoPositions.map((p) => p.type));
    const hasDeFiCtx = kaminoUsdCtx / (totalUsdCtx || 1) > 0.2;
    const stablePctCtx = totalUsdCtx > 0 ? (data.stableUsd / totalUsdCtx) * 100 : 0;
    let concScoreCtx = 0;
    if (hasDeFiCtx) concScoreCtx += defiTypesCtx.size === 1 ? 40 : defiTypesCtx.size === 2 ? 20 : 0;
    if (stablePctCtx > 40) concScoreCtx -= 35; else if (stablePctCtx > 20) concScoreCtx -= 20;
    concScoreCtx = Math.max(0, Math.min(100, concScoreCtx));
    const dryPowderCtx = totalUsdCtx > 0 ? ((data.idleSOL * data.solPrice + data.stableUsd) / totalUsdCtx) * 100 : 0;
    const rawScoreCtx = Math.round(protocolScoreCtx * 0.5 + concScoreCtx * 0.3 + derivScoreCtx * 0.2 + (dryPowderCtx < 1 ? 10 : dryPowderCtx < 5 ? 5 : 0));
    const riskScoreCtx = hasLeverageCtx ? Math.max(41, rawScoreCtx) : rawScoreCtx;
    const riskLabelCtx = riskScoreCtx <= 20 ? "Low" : riskScoreCtx <= 40 ? "Medium" : riskScoreCtx <= 65 ? "High" : "Very High";
    const fetchedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const context = `
## Portfolio (live · fetched ${fetchedAt})
SOL Balance: ${data.solBalance.toFixed(2)} SOL ($${(data.solBalance * data.solPrice).toLocaleString()}) · source: Helius
Staked SOL: ${data.stakedSOL.toFixed(2)} SOL
Idle SOL: ${data.idleSOL.toFixed(2)} SOL ($${(data.idleSOL * data.solPrice).toLocaleString()})
Idle Stablecoins: ${idleStablesCtx || "None"}
Kamino Positions: ${data.kaminoPositions.map((p) => `${p.name} (${p.type}): ${p.amountSOL.toFixed(2)} SOL / $${p.netValueUsd.toFixed(0)}${p.apy ? ` @ ${p.apy}% APY` : ""}`).join("; ") || "None"} · source: Kamino API
Staked JUP: ${(data.stakedJup?.amount ?? 0) > 0.001 ? `${data.stakedJup.amount.toFixed(2)} JUP ($${data.stakedJup.usd.toFixed(0)}) locked in governance${data.stakedJup.unstakingAmount > 0.001 ? ` · ${data.stakedJup.unstakingAmount.toFixed(2)} JUP unstaking (7-day cooldown)` : ""}` : "None"} · source: Jupiter Portfolio API
## Market Data (source: CoinGecko · fetched ${fetchedAt})
SOL Price: $${data.solPrice} (${data.solPrice24hChange >= 0 ? "+" : ""}${data.solPrice24hChange?.toFixed(2) ?? "0"}% 24h)
## Live Yields (source: DeFiLlama · fetched ${fetchedAt})
${yields.map((y) => `${y.label}: ${y.apy}% APY (risk: ${y.risk}, liquidity: ${y.liquidity})`).join("\n")}
## Risk Analysis
Risk Score: ${riskScoreCtx}/100 (${riskLabelCtx})
  · Protocol exposure score: ${protocolScoreCtx}/100
  · Concentration score: ${concScoreCtx}/100
  · Derivatives/leverage score: ${derivScoreCtx}/100${hasLeverageCtx ? ` ($${leverageUsdCtx.toFixed(0)} in multiply)` : " (no leverage)"}
  · Dry powder: ${dryPowderCtx.toFixed(1)}% liquid
    `.trim();

    const chatRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, context }),
    });
    const chatJson = await chatRes.json();
    return { role: "assistant", content: chatJson.reply ?? "Something went wrong." };
  }

  const inputPlaceholder = (() => {
    if (!data) return "Ask about your plan or anything else";
    if (data.idleSOL > 0.01) return `What if SOL hits $${Math.round(data.solPrice * 2).toLocaleString()}?`;
    for (const stable of data.idleStables ?? []) {
      if (stableYields[stable.symbol]?.[0]) return `What if ${stable.symbol} rates drop to 2%?`;
    }
    return "Ask about your plan or anything else";
  })();

  return (
    <main className="flex-1 flex flex-col min-h-0 relative">

      {/* ── Scrollable content ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-2">

        {/* Wallet bar — only visible when connected */}
        {connected && (
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm text-gray-600">DeFi AI Advisor</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSwapOpen(true)}
                className="text-xs text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700 rounded-full px-3 py-1.5 transition-colors"
              >
                Swap
              </button>
              <WalletButton />
            </div>
          </div>
        )}

        {/* Starter screen — feature list fills the scrollable area */}
        {!connected && !data && !loading && (
          <div className="flex flex-col pt-10 pb-4">
            {/* Brand */}
            <p className="text-[11px] text-gray-700 uppercase tracking-widest text-center mb-10">DeFi AI Advisor</p>

            {/* Feature list */}
            <div className="space-y-5">
              {[
                { icon: "◈", label: "Full portfolio overview", desc: "SOL, staked, Kamino positions, tokens — all in one place" },
                { icon: "◉", label: "AI advisor on your data", desc: "Ask about yields, risk, or \"what if SOL hits $500\"" },
                { icon: "◎", label: "Growth projections", desc: "Scenario planning with live APY from DeFiLlama" },
                { icon: "◐", label: "Best yield opportunities", desc: "Compare staking, lending, and liquidity options" },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="text-purple-600 text-base mt-0.5 shrink-0">{f.icon}</span>
                  <div>
                    <p className="text-sm text-gray-300">{f.label}</p>
                    <p className="text-xs text-gray-700 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-gray-800 text-center mt-10">Solana · read-only · no keys stored</p>
          </div>
        )}

        {loading && (
          <div className="animate-pulse flex flex-col gap-4 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-purple-600 text-xs">✦</span>
              <span className="text-xs text-purple-700">AI Analyzing wallet…</span>
            </div>
            {/* Hero value */}
            <div className="space-y-2.5">
              <div className="h-12 w-40 bg-gray-900 rounded-lg" />
              <div className="h-4 w-32 bg-gray-900 rounded-full" />
              <div className="h-7 w-36 bg-gray-900 rounded-full" />
            </div>
            {/* Plan card */}
            <div className="mt-2 bg-gray-950 border border-gray-800 rounded-2xl p-5 space-y-3">
              <div className="h-3 w-16 bg-gray-800 rounded" />
              <div className="h-5 w-48 bg-gray-800 rounded" />
              <div className="h-8 w-24 bg-gray-800 rounded" />
              <div className="h-3 w-32 bg-gray-800 rounded" />
              <div className="mt-4 h-36 bg-gray-900 rounded-xl" />
              <div className="h-12 bg-gray-800 rounded-full" />
            </div>
          </div>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {data && (() => {
          // ── Core values ──────────────────────────────────────────────
          const kaminoUsd = data.kaminoPositions.reduce((s, p) => s + p.netValueUsd, 0);
          const nativeSolUsd = (data.idleSOL + data.stakedSOL) * data.solPrice;
          const jupStakedUsd = (data.stakedJup?.usd ?? 0) + (data.stakedJup?.unstakingAmount ?? 0) * (data.stakedJup?.jupPrice ?? 0);
          const totalUsd = nativeSolUsd + kaminoUsd + data.stableUsd + data.otherUsd + jupStakedUsd;
          const change24hUsd = totalUsd * ((data.solPrice24hChange ?? 0) / 100);
          const bestNativeAPY = yields.find((y) => y.label === "Native Staking")?.apy ?? 5.65;
          const yearlyIdleUsd = data.idleSOL * (bestNativeAPY / 100) * data.solPrice;
          const nativeAPY = bestNativeAPY / 100;

          // ── Efficiency score ─────────────────────────────────────────
          const RISK_WEIGHTS: Record<string, number> = { multiply: 1.0, liquidity: 0.6, lending: 0.5, earn: 0.3 };
          let protocolSum = 0;
          for (const p of data.kaminoPositions) protocolSum += p.netValueUsd * (RISK_WEIGHTS[p.type] ?? 0.3);
          protocolSum += data.stakedSOL * data.solPrice * 0.1 + data.idleSOL * data.solPrice * 0.05 + data.stableUsd * 0.02 + data.otherUsd * 0.15 + jupStakedUsd * 0.15;
          const protocolScore = totalUsd > 0 ? Math.min(100, Math.round((protocolSum / totalUsd) * 100)) : 0;
          const hasLeverage = data.kaminoPositions.some((p) => p.type === "multiply");
          const leverageUsdAmt = data.kaminoPositions.filter((p) => p.type === "multiply").reduce((s, p) => s + p.netValueUsd, 0);
          const derivativesScore = hasLeverage ? Math.min(100, Math.round(50 + (leverageUsdAmt / (totalUsd || 1)) * 50)) : 0;
          const defiTypes = new Set(data.kaminoPositions.map((p) => p.type));
          const hasDeFi = kaminoUsd / (totalUsd || 1) > 0.2;
          const stablePct = totalUsd > 0 ? (data.stableUsd / totalUsd) * 100 : 0;
          let concentrationScore = 0;
          if (hasDeFi) concentrationScore += defiTypes.size === 1 ? 40 : defiTypes.size === 2 ? 20 : 0;
          if (stablePct > 40) concentrationScore -= 35;
          else if (stablePct > 20) concentrationScore -= 20;
          concentrationScore = Math.max(0, Math.min(100, concentrationScore));
          const dryPowderPct = totalUsd > 0 ? ((data.idleSOL * data.solPrice + data.stableUsd) / totalUsd) * 100 : 0;
          const rawScore = Math.round(protocolScore * 0.5 + concentrationScore * 0.3 + derivativesScore * 0.2 + (dryPowderPct < 1 ? 10 : dryPowderPct < 5 ? 5 : 0));
          const riskScore = hasLeverage ? Math.max(41, rawScore) : rawScore;
          const riskLabel = riskScore <= 20 ? "Low" : riskScore <= 40 ? "Medium" : riskScore <= 65 ? "High" : "Very High";
          const riskColor = riskScore <= 20 ? "text-green-400" : riskScore <= 40 ? "text-yellow-400" : riskScore <= 65 ? "text-orange-400" : "text-red-400";
          const riskBgColor = riskScore <= 20 ? "bg-green-400" : riskScore <= 40 ? "bg-yellow-400" : riskScore <= 65 ? "bg-orange-400" : "bg-red-400";
          const effScore = Math.max(0, 100 - riskScore);
          const effLabel = effScore >= 80 ? "Excellent" : effScore >= 60 ? "Good" : effScore >= 40 ? "Fair" : "Low";

          // ── Plans ────────────────────────────────────────────────────
          type Plan = {
            title: string; impact: string; impactUsd: number; detail: string; onCta: () => void;
            chartType: "sol" | "stable";
            stableUsd?: number; stableApy?: number; stableSymbol?: string;
          };
          const plans: Plan[] = [];
          if (data.idleSOL > 0.01) {
            plans.push({
              title: "Stake your idle SOL",
              impact: `+${fmtUSD(yearlyIdleUsd)}/yr`,
              impactUsd: yearlyIdleUsd,
              detail: "vs doing nothing",
              onCta: () => setStakeModalOpen(true),
              chartType: "sol",
            });
          }
          for (const stable of data.idleStables ?? []) {
            const best = stableYields[stable.symbol]?.[0];
            if (!best) continue;
            const yr = stable.usd * best.apy / 100;
            if (yr < 1 || stable.usd < 5) continue;
            plans.push({
              title: `Deploy your ${stable.symbol}`,
              impact: `+${fmtUSD(yr)}/yr`,
              impactUsd: yr,
              detail: `on ${best.protocol} · ${best.apy}% APY · DeFiLlama`,
              onCta: () => setStableModal({ symbol: stable.symbol, idleUsd: stable.usd }),
              chartType: "stable",
              stableUsd: stable.usd,
              stableApy: best.apy,
              stableSymbol: stable.symbol,
            });
          }
          // Kamino earn positions earning meaningfully below native staking APY
          for (const p of data.kaminoPositions) {
            if (p.type !== "earn" || !p.apy || p.amountSOL < 0.01) continue;
            const apyGap = bestNativeAPY - p.apy;
            if (apyGap < 1) continue; // only flag if spread > 1%
            const yearlyGapUsd = (apyGap / 100) * p.amountSOL * data.solPrice;
            if (yearlyGapUsd < 1) continue; // not worth showing
            plans.push({
              title: `${p.name} earns ${p.apy.toFixed(1)}% — staking pays ${bestNativeAPY}%`,
              impact: `+${fmtUSD(yearlyGapUsd)}/yr`,
              impactUsd: yearlyGapUsd,
              detail: `${p.apy.toFixed(1)}% earn vs ${bestNativeAPY}% native · gap costs ${fmtUSD(yearlyGapUsd)}/yr`,
              onCta: () => setStakeModalOpen(true),
              chartType: "sol",
            });
          }

          // Always show at least one plan so the card never appears empty
          if (plans.length === 0) {
            plans.push({
              title: "Portfolio fully deployed",
              impact: "+0 idle assets",
              impactUsd: 0,
              detail: "All your SOL is staked or earning. Ask the AI for advanced rebalancing ideas.",
              onCta: () => {},
              chartType: "sol",
            });
          }

          const planIdx = Math.min(currentPlanIndex, Math.max(0, plans.length - 1));
          const activePlan = plans[planIdx];

          // ── Chart ────────────────────────────────────────────────────
          const deployedBase = data.stakedSOL + data.kaminoSOL; // already earning
          const totalSOL = deployedBase + data.idleSOL;         // everything
          const isStablePlan = activePlan?.chartType === "stable";
          const now = new Date();
          const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const totalPoints = timeframe === "1Y" ? 12 : timeframe === "3Y" ? 36 : 60;
          const labelStep = timeframe === "1Y" ? 2 : timeframe === "3Y" ? 6 : 12;
          const showOptimized = isStablePlan || data.idleSOL > 0.01;

          // Both lines start at the SAME value today and diverge from there
          const chartData = Array.from({ length: totalPoints + 1 }, (_, m) => {
            const yr = m / 12;
            if (isStablePlan && activePlan.stableUsd != null && activePlan.stableApy != null) {
              // No rounding — Math.round on small amounts creates a step function
              // that cubic spline interpolation then overshoots into a visible spike
              return {
                m,
                current: activePlan.stableUsd,
                optimized: activePlan.stableUsd * Math.pow(1 + activePlan.stableApy / 100, yr),
              };
            }
            // Current path: deployed SOL grows at APY, idle SOL stays flat (does nothing)
            const currentPathUSD = (deployedBase * Math.pow(1 + nativeAPY, yr) + data.idleSOL) * data.solPrice;
            // Optimized: ALL SOL grows at APY — same start, faster growth
            const optimizedSOL = totalSOL * Math.pow(1 + nativeAPY, yr);
            const optimizedUSD = optimizedSOL * data.solPrice;
            const scenarioData: Record<string, number> = {};
            for (const s of forecastScenarios) {
              if (s.type === "price" && s.targetPrice != null) {
                const t = s.targetMonths > 0 ? Math.min(m / s.targetMonths, 1) : 1;
                const projPrice = data.solPrice + (s.targetPrice - data.solPrice) * t;
                scenarioData[`s_${s.id}`] = Math.round(optimizedSOL * projPrice);
              } else if (s.type === "contribution" && s.solPerMonth != null) {
                const extra = Math.min(m, s.targetMonths) * s.solPerMonth;
                scenarioData[`s_${s.id}`] = Math.round((totalSOL + extra) * Math.pow(1 + nativeAPY, yr) * data.solPrice);
              }
            }
            return {
              m,
              current: Math.round(currentPathUSD),
              ...(showOptimized && { optimized: Math.round(optimizedUSD) }),
              ...scenarioData,
            };
          });
          const lastPoint = chartData[totalPoints] as unknown as Record<string, number>;
          const finalCurrentUSD = chartData[totalPoints].current;
          const finalOptimizedUSD = lastPoint.optimized ?? finalCurrentUSD;
          const gainPct = showOptimized && finalCurrentUSD > 0
            ? ((finalOptimizedUSD - finalCurrentUSD) / finalCurrentUSD * 100).toFixed(1)
            : null;
          const ticks = Array.from({ length: Math.floor(totalPoints / labelStep) + 1 }, (_, i) => i * labelStep);
          const fmtTick = (m: number) => {
            if (m === 0) return "Now";
            const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
            return timeframe === "1Y" ? MONTHS[d.getMonth()] : `${d.getFullYear()}`;
          };

          return (
            <div className="flex flex-col">

              {/* ── 1. HERO VALUE ───────────────────────────────────── */}
              <div className="pt-2 pb-4">
                <p className="text-5xl font-bold tracking-tight">{fmtUSD(totalUsd)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-sm">
                    <span className={change24hUsd >= 0 ? "text-green-400" : "text-red-400"}>
                      {change24hUsd >= 0 ? "↑" : "↓"} {fmtUSD(Math.abs(change24hUsd))} · {Math.abs(data.solPrice24hChange ?? 0).toFixed(2)}%
                    </span>
                    <span className="text-gray-600"> 24h</span>
                  </p>
                  <span className="text-[10px] text-gray-700">· CoinGecko</span>
                </div>
                <Link href="/portfolio">
                  <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full border border-gray-800 hover:border-gray-700 transition-colors">
                    <div className={`w-1.5 h-1.5 rounded-full ${riskBgColor}`} />
                    <span className="text-xs text-gray-500">Efficiency <span className={riskColor}>{effLabel}</span></span>
                    <span className="text-[10px] text-gray-700">{effScore}/100 →</span>
                  </div>
                </Link>
              </div>

              {/* ── 2+3. UNIFIED CARD: chart + plan ─────────────────── */}
              {(() => {
                    const todayUSD = chartData[0].current;
                    const gainCurrent = finalCurrentUSD - todayUSD;
                    const gainOptimized = finalOptimizedUSD - todayUSD;
                    const pct = totalUsd > 0 && activePlan ? (activePlan.impactUsd / totalUsd) * 100 : 0;
                    const [impactLabel, impactBorder] =
                      pct >= 5   ? ["Very high impact", "border-green-500 text-green-400"]
                      : pct >= 2 ? ["High impact",      "border-green-500 text-green-400"]
                      : pct >= 0.5 ? ["Moderate impact", "border-yellow-500 text-yellow-400"]
                      :              ["Low impact",       "border-gray-700 text-gray-500"];

                    return (
                      <div
                        className="mt-4 bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden"
                        onTouchStart={(e) => { planTouchX.current = e.touches[0].clientX; }}
                        onTouchEnd={(e) => {
                          const dx = e.changedTouches[0].clientX - planTouchX.current;
                          if (Math.abs(dx) > 48) {
                            if (dx < 0) { planDir.current = 1; setCurrentPlanIndex((i) => Math.min(plans.length - 1, i + 1)); }
                            else { planDir.current = -1; setCurrentPlanIndex((i) => Math.max(0, i - 1)); }
                          }
                        }}
                      >

                        {/* ── Plan label + dot pagination ── */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-1">
                          <p className="text-xs text-gray-600">Plan</p>
                          {plans.length > 1 && (
                            <div className="flex items-center gap-1.5">
                              {plans.map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => { planDir.current = i > planIdx ? 1 : -1; setCurrentPlanIndex(i); }}
                                  className={`h-1.5 rounded-full transition-all duration-300 ${
                                    i === planIdx ? "w-4 bg-white" : "w-1.5 bg-gray-700 hover:bg-gray-500"
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* ── Animated plan content ── */}
                        <div
                          key={planIdx}
                          style={{ animation: `${planDir.current >= 0 ? "plan-slide-from-right" : "plan-slide-from-left"} 0.22s ease-out both` }}
                        >

                        {/* ── Plan title + badge inline ── */}
                        <div className="px-5 pt-1 flex items-center gap-2 flex-wrap">
                          <p className="text-base font-semibold text-white leading-tight">
                            {activePlan ? activePlan.title : "Portfolio forecast"}
                          </p>
                          {activePlan && (
                            <span className={`inline-block text-[10px] font-medium border rounded-full px-2 py-px ${impactBorder}`}>
                              {impactLabel}
                            </span>
                          )}
                        </div>

                        {/* ── Hero impact number ── */}
                        {activePlan && (
                          <p className="px-5 pt-2 text-2xl font-bold text-green-400 tracking-tight leading-none">
                            {activePlan.impact}
                          </p>
                        )}

                        {/* ── Detail text ── */}
                        {activePlan && (
                          <p className="px-5 pt-2 text-xs text-gray-600 leading-relaxed">{activePlan.detail}</p>
                        )}

                        {/* ── Legend (Jupiter-style: label above, colored value below) + timeframe ── */}
                        <div className="flex items-end justify-between px-5 pt-4 pb-2">
                          <div className="flex gap-5">
                            {isStablePlan ? (
                              <>
                                <div>
                                  <p className="text-[11px] text-gray-600 mb-0.5">Idle funds</p>
                                  <p className="text-sm font-semibold text-yellow-400 tabular-nums">{fmtUSD(activePlan?.stableUsd ?? 0)}</p>
                                </div>
                                {showOptimized && (
                                  <div>
                                    <p className="text-[11px] text-gray-600 mb-0.5">With plan</p>
                                    <p className="text-sm font-semibold text-green-400 tabular-nums">+{fmtUSD(gainOptimized)}</p>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div>
                                  <p className="text-[11px] text-gray-600 mb-0.5">Current path</p>
                                  <p className="text-sm font-semibold text-yellow-400 tabular-nums">+{fmtUSD(gainCurrent)}</p>
                                </div>
                                {showOptimized && (
                                  <div>
                                    <p className="text-[11px] text-gray-600 mb-0.5">With plan</p>
                                    <p className="text-sm font-semibold text-green-400 tabular-nums">+{fmtUSD(gainOptimized)}</p>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          <div className="flex gap-3 pb-0.5">
                            {(["1Y","3Y","5Y"] as const).map((tf) => (
                              <button key={tf} onClick={() => setTimeframe(tf)}
                                className={`text-xs transition-colors ${timeframe === tf ? "text-white font-medium" : "text-gray-600 hover:text-gray-400"}`}>
                                {tf}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* ── Scenario chips ── */}
                        {!isStablePlan && forecastScenarios.length > 0 && (
                          <div className="flex flex-row flex-wrap gap-1.5 px-5 pb-3">
                            {forecastScenarios.map((s) => (
                              <div key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                                style={{ background: `${s.color}12`, border: `1px solid ${s.color}35`, color: s.color }}>
                                <span className="inline-flex items-center justify-center rounded-full shrink-0"
                                  style={{ width: 14, height: 14, border: `1px solid currentColor`, opacity: 0.8 }}>
                                  <svg width="8" height="6" viewBox="0 0 9 7" fill="none">
                                    <polyline points="0,6.5 2,4 4.5,5.5 7,1.5 9,0.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </span>
                                <span className="whitespace-nowrap">{s.label}</span>
                                <button onClick={() => setForecastScenarios((prev) => prev.filter((x) => x.id !== s.id))}
                                  className="opacity-40 hover:opacity-70 leading-none ml-0.5">✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ── Chart: full-bleed ── */}
                        <ResponsiveContainer width="100%" height={140}>
                          <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                            <defs>
                              <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#fbbf24" stopOpacity={0.3} />
                                <stop offset="60%"  stopColor="#fbbf24" stopOpacity={0.05} />
                                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gradOptimized" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#4ade80" stopOpacity={0.28} />
                                <stop offset="60%"  stopColor="#4ade80" stopOpacity={0.05} />
                                <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
                              </linearGradient>
                              {forecastScenarios.map((s) => (
                                <linearGradient key={s.id} id={`grad_${s.id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%"   stopColor={s.color} stopOpacity={0.2} />
                                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                                </linearGradient>
                              ))}
                            </defs>
                            <CartesianGrid vertical={false} stroke="#161616" strokeDasharray="4 4" />
                            <XAxis dataKey="m" type="number" domain={[0, totalPoints]}
                              ticks={ticks} tickFormatter={fmtTick}
                              tick={{ fill: "#3f3f46", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="left" hide domain={["auto", "auto"]} />
                            <Tooltip
                              cursor={{ stroke: "#2d2d2d", strokeWidth: 1, strokeDasharray: "4 2" }}
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div style={{ background: "#0a0a0a", border: "1px solid #27272a", borderRadius: 8, fontSize: 11, padding: "8px 12px", minWidth: 160 }}>
                                    <p style={{ color: "#52525b", marginBottom: 6 }}>{fmtTick(label as number)}</p>
                                    {payload.map((entry) => {
                                      const sname = String(entry.dataKey);
                                      const v = Number(entry.value);
                                      let label2: string;
                                      let color: string = String(entry.color ?? "#a1a1aa");
                                      if (isStablePlan) {
                                        label2 = sname === "optimized" ? "Deployed" : "Idle";
                                      } else if (sname === "optimized") {
                                        label2 = "With plan";
                                        color = "#4ade80";
                                      } else if (sname === "current") {
                                        label2 = "Current path";
                                        color = "#fbbf24";
                                      } else if (sname.startsWith("s_")) {
                                        const sc = forecastScenarios.find((s) => s.id === sname.slice(2));
                                        label2 = sc?.label ?? sname;
                                        color = sc?.color ?? color;
                                      } else {
                                        label2 = sname;
                                      }
                                      return (
                                        <div key={sname} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                                          <span style={{ color: "#a1a1aa" }}>{label2} : {fmtUSD(v)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }}
                            />
                            {showOptimized && (
                              <Area yAxisId="left" type="natural" dataKey="optimized"
                                stroke="#4ade80" strokeWidth={2} fill="url(#gradOptimized)"
                                dot={false} activeDot={{ r: 4, fill: "#4ade80", stroke: "#0a0a0a", strokeWidth: 1.5 }}
                                isAnimationActive={false} />
                            )}
                            <Area yAxisId="left" type="natural" dataKey="current"
                              stroke="#fbbf24" strokeWidth={2.5} fill="url(#gradCurrent)"
                              dot={false} activeDot={{ r: 4, fill: "#fbbf24", stroke: "#0a0a0a", strokeWidth: 1.5 }}
                              isAnimationActive={false} />
                            {forecastScenarios.map((s) => (
                              <Area key={s.id} yAxisId="left" type="natural" dataKey={`s_${s.id}`}
                                stroke={s.color} strokeWidth={1.5} strokeDasharray="4 2"
                                fill={`url(#grad_${s.id})`} dot={false} isAnimationActive={false} />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>

                        {/* ── Attribution + CTA ── */}
                        <p className="text-[10px] text-gray-700 text-right px-5 pt-1">
                          DeFiLlama · CoinGecko · Helius · Kamino
                        </p>
                        {activePlan && (
                          <div className="px-5 pt-3 pb-5">
                            <button onClick={activePlan.onCta}
                              className="w-full bg-white text-black font-semibold py-3.5 rounded-full hover:bg-gray-100 transition-colors text-sm">
                              Review plan →
                            </button>
                          </div>
                        )}
                        </div>{/* end animated plan content */}
                      </div>
                    );
              })()}


            </div>
          );
        })()}

      </div>{/* end scrollable area */}

      {/* ── Starter entry — pinned to bottom, thumb-reachable ── */}
      {!connected && !data && !loading && (
        <div className="px-5 pb-5 pt-3 space-y-3 shrink-0">
          <button
            onClick={() => setVisible(true)}
            className="w-full bg-white text-black text-sm font-bold py-3.5 rounded-full hover:bg-gray-100 transition-colors"
          >
            Connect Wallet
          </button>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-600 shrink-0">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>
          <div className="flex items-center border border-gray-800 rounded-full pl-4 pr-1.5 py-1.5 bg-gray-950">
            <input
              type="text"
              placeholder="Paste any Solana address…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && address.trim() && analyze()}
              className="flex-1 bg-transparent text-sm outline-none text-gray-300 placeholder-gray-700 min-w-0"
            />
            <button
              onClick={() => analyze()}
              disabled={!address.trim()}
              className="shrink-0 ml-2 bg-white text-black text-xs font-bold px-4 py-2.5 rounded-full disabled:opacity-30 transition-all"
            >
              Go
            </button>
          </div>
        </div>
      )}

      {/* AI chip — only shown once wallet/address is loaded */}
      {(connected || !!data) && (
        <ChatPanel
          placeholder={inputPlaceholder}
          onSend={handleChatSend}
        />
      )}

      {stakeModalOpen && data && (
        <NativeStakeModal
          onClose={() => setStakeModalOpen(false)}
          maxSOL={data.solBalance}
        />
      )}
      {stableModal && (
        <StableYieldModal
          symbol={stableModal.symbol}
          idleUsd={stableModal.idleUsd}
          options={stableYields[stableModal.symbol] ?? []}
          onClose={() => setStableModal(null)}
        />
      )}
      {swapOpen && (
        <SwapModal onClose={() => setSwapOpen(false)} />
      )}
      <BottomNav />
    </main>
  );
}
