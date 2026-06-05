"use client";

import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import NativeStakeModal from "./components/NativeStakeModal";
import BottomNav from "./components/BottomNav";

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
  error?: string;
}

const SCENARIO_COLORS = ["#a855f7", "#60a5fa", "#f472b6", "#2dd4bf", "#fb923c"];

// Never round small amounts to zero
function fmtSOL(sol: number): string {
  if (sol === 0) return "0";
  if (sol < 0.0001) return sol.toFixed(6);
  if (sol < 0.01) return sol.toFixed(4);
  if (sol < 1) return sol.toFixed(3);
  return sol.toFixed(2);
}
function fmtUSD(usd: number): string {
  if (usd === 0) return "$0";
  if (Math.abs(usd) < 0.01) return "<$0.01";
  if (Math.abs(usd) < 10) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString()}`;
}

// Rotate suggested questions after each use
function nextSuggestedQuestion(
  used: string,
  d: WalletData,
  stableYieldsData: Record<string, StableYield[]>
): string {
  const qs: string[] = [];
  if (d.idleSOL > 0.01) {
    qs.push(`What if SOL hits $${Math.round(d.solPrice * 2).toLocaleString()}?`);
    qs.push(`What if SOL hits $${Math.round(d.solPrice * 3).toLocaleString()}?`);
    qs.push("What if I add 1 SOL per month for 2 years?");
  }
  for (const stable of d.idleStables ?? []) {
    if (stableYieldsData[stable.symbol]?.[0]) qs.push(`What if ${stable.symbol} rates drop to 2%?`);
  }
  qs.push("How does Jito compare to native staking?");
  qs.push("What's the risk of keeping SOL idle?");
  if (qs.length === 0) return "Ask about your plan or anything else";
  const idx = qs.indexOf(used);
  return qs[(idx + 1) % qs.length];
}

export default function Home() {
  const { publicKey, connected } = useWallet();
  const [address, setAddress] = useState("");
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [timeframe, setTimeframe] = useState<"1Y" | "3Y" | "5Y">("3Y");
  const [yields, setYields] = useState<YieldOption[]>([]);
  const [stableYields, setStableYields] = useState<Record<string, StableYield[]>>({});
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [stakeModalOpen, setStakeModalOpen] = useState(false);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0);
  const [forecastScenarios, setForecastScenarios] = useState<Array<{
    id: string;
    type: "price" | "contribution";
    targetPrice?: number;
    solPerMonth?: number;
    targetMonths: number;
    label: string;
    color: string;
  }>>([]);

  const [chipFocused, setChipFocused] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // Auto-scroll thread to bottom when new messages arrive
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [chatMessages]);

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
        if (json.idleSOL > 0.01) {
          setChatInput(`What if SOL hits $${Math.round(json.solPrice * 2).toLocaleString()}?`);
        }
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Unified send: routes to /api/forecast (chart scenario) or /api/chat (general question)
  async function sendUnified() {
    const q = chatInput.trim();
    if (!q || !data || chatLoading) return;

    const userMsg = { role: "user", content: q };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);

    const now = new Date();
    const bestAPY = yields.find((y) => y.label === "Native Staking")?.apy ?? 5.65;
    const nativeAPY = bestAPY / 100;
    const stakedBase = data.stakedSOL + data.kaminoSOL;
    const projBase = stakedBase < 0.001 ? data.idleSOL : stakedBase;

    try {
      // 1. Try chart scenario classification
      if (forecastScenarios.length < 5) {
        const fRes = await fetch("/api/forecast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            currentPrice: data.solPrice,
            currentDate: now.toISOString().slice(0, 10),
          }),
        });
        const fResult = await fRes.json();

        if (fResult.targetPrice != null || fResult.solPerMonth != null) {
          const newScenario = {
            ...fResult,
            id: `${Date.now()}`,
            color: SCENARIO_COLORS[forecastScenarios.length % SCENARIO_COLORS.length],
          };
          setForecastScenarios((prev) => [...prev, newScenario]);

          let reply: string;
          if (fResult.type === "price" && fResult.targetPrice != null) {
            const projSOL = projBase * Math.pow(1 + nativeAPY, fResult.targetMonths / 12);
            reply = `At $${fResult.targetPrice.toLocaleString()}/SOL, your ${fmtSOL(projSOL)} staked SOL = ${fmtUSD(projSOL * fResult.targetPrice)}. Chart updated above.`;
          } else {
            const months = fResult.targetMonths;
            const finalSOL = (projBase + months * fResult.solPerMonth) * Math.pow(1 + nativeAPY, months / 12);
            reply = `Adding ${fResult.solPerMonth} SOL/month for ${months} months → ${fmtSOL(finalSOL)} SOL · ${fmtUSD(finalSOL * data.solPrice)}. Chart updated above.`;
          }
          setChatMessages([...updated, { role: "assistant", content: reply }]);
          // Suggest next question after chart scenario
          setChatInput(nextSuggestedQuestion(q, data, stableYields));
          setChipFocused(true);
          return;
        }
      }

      // 2. General question → /api/chat
      const idleStablesCtx = (data.idleStables ?? [])
        .map((s) => {
          const best = stableYields[s.symbol]?.[0];
          return `${s.symbol} $${s.usd.toLocaleString()} idle${best ? ` (best yield: ${best.apy}% on ${best.protocol})` : ""}`;
        })
        .join(", ");

      const context = `
SOL Balance: ${data.solBalance.toFixed(2)} SOL ($${(data.solBalance * data.solPrice).toLocaleString()})
Staked SOL: ${data.stakedSOL.toFixed(2)} SOL
Idle SOL: ${data.idleSOL.toFixed(2)} SOL ($${(data.idleSOL * data.solPrice).toLocaleString()})
Idle Stablecoins: ${idleStablesCtx || "None"}
Kamino Positions: ${data.kaminoPositions.map((p) => `${p.name}: ${p.amountSOL.toFixed(2)} SOL ($${p.netValueUsd.toFixed(0)})`).join(", ") || "None"}
SOL Price: $${data.solPrice}
Live APYs: ${yields.map((y) => `${y.label} ${y.apy}%`).join(", ")}
      `.trim();

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, context }),
      });
      const chatJson = await chatRes.json();
      setChatMessages([...updated, { role: "assistant", content: chatJson.reply }]);
      // Suggest next question after general reply
      setChatInput(nextSuggestedQuestion(q, data, stableYields));
      setChipFocused(true);
    } catch {
      setChatMessages([...updated, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  // Derive input placeholder from first available plan (for hint)
  const inputPlaceholder = (() => {
    if (!data) return "Ask about your plan or anything else";
    if (data.idleSOL > 0.01) return `What if SOL hits $${Math.round(data.solPrice * 2).toLocaleString()}?`;
    for (const stable of data.idleStables ?? []) {
      if (stableYields[stable.symbol]?.[0]) return `What if ${stable.symbol} rates drop to 2%?`;
    }
    return "Ask about your plan or anything else";
  })();

  return (
    // h-dvh = dynamic viewport height — shrinks when keyboard opens, input stays pinned
    <main className="h-dvh flex flex-col bg-black text-white max-w-lg mx-auto overflow-hidden">

      {/* ── Scrollable content ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-2">

        {/* Wallet bar */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-gray-600">DeFi AI Advisor</span>
          <WalletMultiButton style={{ fontSize: 12, height: 32, background: connected ? "#166534" : "#1f2937" }} />
        </div>

        {!connected && (
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="Solana wallet address…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm outline-none focus:border-gray-600"
            />
            <button
              onClick={() => analyze()}
              disabled={loading}
              className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? "…" : "Analyze"}
            </button>
          </div>
        )}

        {loading && <p className="text-gray-600 text-sm">Analyzing wallet…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {data && (() => {
          // ── Core values ──────────────────────────────────────────────
          const kaminoUsd = data.kaminoPositions.reduce((s, p) => s + p.netValueUsd, 0);
          const nativeSolUsd = (data.idleSOL + data.stakedSOL) * data.solPrice;
          const totalUsd = nativeSolUsd + kaminoUsd + data.stableUsd + data.otherUsd;
          const change24hUsd = totalUsd * ((data.solPrice24hChange ?? 0) / 100);
          const bestNativeAPY = yields.find((y) => y.label === "Native Staking")?.apy ?? 5.65;
          const yearlyIdleUsd = data.idleSOL * (bestNativeAPY / 100) * data.solPrice;
          const nativeAPY = bestNativeAPY / 100;

          // ── Efficiency score ─────────────────────────────────────────
          const RISK_WEIGHTS: Record<string, number> = { multiply: 1.0, liquidity: 0.6, lending: 0.5, earn: 0.3 };
          let protocolSum = 0;
          for (const p of data.kaminoPositions) protocolSum += p.netValueUsd * (RISK_WEIGHTS[p.type] ?? 0.3);
          protocolSum += data.stakedSOL * data.solPrice * 0.1 + data.idleSOL * data.solPrice * 0.05 + data.stableUsd * 0.02 + data.otherUsd * 0.15;
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
          const effScore = Math.max(0, 100 - riskScore);
          const effLabel = effScore >= 80 ? "Excellent" : effScore >= 60 ? "Good" : effScore >= 40 ? "Fair" : "Low";

          // ── Plans ────────────────────────────────────────────────────
          type Plan = { title: string; impact: string; detail: string; onCta: () => void };
          const plans: Plan[] = [];
          if (data.idleSOL > 0.01) {
            plans.push({
              title: "Stake your idle SOL",
              impact: `+${fmtUSD(yearlyIdleUsd)}/yr`,
              detail: "vs doing nothing",
              onCta: () => setStakeModalOpen(true),
            });
          }
          for (const stable of data.idleStables ?? []) {
            const best = stableYields[stable.symbol]?.[0];
            if (!best) continue;
            const yr = stable.usd * best.apy / 100;
            if (yr < 0.01) continue;
            plans.push({
              title: `Deploy your ${stable.symbol}`,
              impact: `+${fmtUSD(yr)}/yr`,
              detail: `on ${best.protocol} · ${best.apy}% APY`,
              onCta: () => window.open(best.url, "_blank"),
            });
          }
          const planIdx = Math.min(currentPlanIndex, Math.max(0, plans.length - 1));
          const activePlan = plans[planIdx];

          // ── Chart ────────────────────────────────────────────────────
          const currentBase = data.stakedSOL + data.kaminoSOL;
          const hasIdle = data.idleSOL > 0.001;
          const optimizedBase = currentBase + data.idleSOL;
          const noDeployed = currentBase < 0.001;
          const projBase = noDeployed ? data.idleSOL : currentBase;
          const now = new Date();
          const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const totalPoints = timeframe === "1Y" ? 12 : timeframe === "3Y" ? 36 : 60;
          const labelStep = timeframe === "1Y" ? 2 : timeframe === "3Y" ? 6 : 12;
          const chartData = Array.from({ length: totalPoints + 1 }, (_, m) => {
            const yr = m / 12;
            const solAmount = projBase * Math.pow(1 + nativeAPY, yr);
            const solOptimized = optimizedBase * Math.pow(1 + nativeAPY, yr);
            const scenarioData: Record<string, number> = {};
            for (const s of forecastScenarios) {
              if (s.type === "price" && s.targetPrice != null) {
                const t = s.targetMonths > 0 ? Math.min(m / s.targetMonths, 1) : 1;
                scenarioData[`s_${s.id}`] = Math.round(solAmount * (data.solPrice + (s.targetPrice - data.solPrice) * t));
              } else if (s.type === "contribution" && s.solPerMonth != null) {
                scenarioData[`s_${s.id}`] = parseFloat(((projBase + Math.min(m, s.targetMonths) * s.solPerMonth) * Math.pow(1 + nativeAPY, yr)).toFixed(3));
              }
            }
            return {
              m,
              current: parseFloat(solAmount.toFixed(3)),
              ...(hasIdle && !noDeployed && { optimized: parseFloat(solOptimized.toFixed(3)) }),
              ...scenarioData,
            };
          });
          const last = chartData[totalPoints];
          const lastPoint = last as unknown as Record<string, number>;
          const finalOptimized = (last as { optimized?: number }).optimized ?? last.current;
          const extraGain = finalOptimized - last.current;
          const hasPriceScenario = forecastScenarios.some((s) => s.type === "price");
          const ticks = Array.from({ length: Math.floor(totalPoints / labelStep) + 1 }, (_, i) => i * labelStep);
          const fmtTick = (m: number) => {
            if (m === 0) return "Now";
            const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
            return timeframe === "1Y" ? MONTHS[d.getMonth()] : `${d.getFullYear()}`;
          };

          return (
            <div className="space-y-4">

              {/* ── 1. PORTFOLIO HEADER ─────────────────────────────── */}
              <div className="pb-2">
                <div className="mb-3">
                  <span className="inline-flex items-center gap-2 text-xs bg-gray-900 border border-gray-800 text-gray-500 px-3 py-1 rounded-full">
                    <span className="text-white font-medium">{effLabel}</span> efficiency · {effScore}/100
                    <span className="text-purple-400">Optimize →</span>
                  </span>
                </div>
                <p className="text-4xl font-bold">{fmtUSD(totalUsd)}</p>
                <p className="text-gray-500 text-sm mt-1">
                  {change24hUsd >= 0 ? "+" : "−"}{fmtUSD(Math.abs(change24hUsd))} today
                  {" · "}{(data.solPrice24hChange ?? 0) >= 0 ? "↑" : "↓"} {Math.abs(data.solPrice24hChange ?? 0).toFixed(2)}%
                </p>
              </div>

              {/* ── 2. AI ADVISOR CARD (dark, standalone) ───────────── */}
              {plans.length > 0 && (
                <div className="bg-black rounded-2xl px-5 pt-4 pb-5 space-y-3">
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <span className="text-sm text-purple-400 font-semibold">✦ AI Advisor</span>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{plans.length} plan{plans.length > 1 ? "s" : ""} found</p>
                      {plans.length > 1 && (
                        <p className="text-xs text-gray-500">Plan {planIdx + 1} of {plans.length} ›</p>
                      )}
                    </div>
                  </div>
                  {/* Dot pagination */}
                  {plans.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      {plans.map((_, i) => (
                        <button key={i} onClick={() => setCurrentPlanIndex(i)}
                          className={`rounded-full transition-all ${i === planIdx ? "w-2 h-2 bg-white" : "w-1.5 h-1.5 bg-gray-600 hover:bg-gray-400"}`} />
                      ))}
                    </div>
                  )}
                  {/* Plan headline — title + impact stacked, same weight */}
                  <div>
                    <p className="text-2xl font-bold text-white leading-snug">{activePlan.title}</p>
                    <p className="text-2xl font-bold text-white">{activePlan.impact}</p>
                  </div>
                  {/* Full-width pill CTA */}
                  <button onClick={activePlan.onCta}
                    className="w-full bg-white text-black font-semibold py-3 rounded-full hover:bg-gray-100 transition-colors text-sm">
                    Review plan →
                  </button>
                </div>
              )}

              {/* ── 3. PROJECTION LABEL ─────────────────────────────── */}
              <p className="text-xs text-gray-600 px-1">Projection for this plan</p>

              {/* ── 4. CHART SECTION ────────────────────────────────── */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden px-4 pt-4 pb-4">
                {/* Stats + timeframe */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    <span className="text-xs">
                      <span className="text-yellow-500">Staked</span>
                      <span className="text-yellow-300 font-medium ml-1">{fmtSOL(last.current)} SOL</span>
                      <span className="text-yellow-800 ml-1">· {fmtUSD(last.current * data.solPrice)}</span>
                    </span>
                    {hasIdle && !noDeployed && (
                      <span className="text-xs">
                        <span className="text-green-500">+ idle</span>
                        <span className="text-green-300 font-medium ml-1">{fmtSOL(finalOptimized)} SOL</span>
                        <span className="text-green-800 ml-1">+{fmtUSD(extraGain * data.solPrice)}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    {(["1Y","3Y","5Y"] as const).map((tf) => (
                      <button key={tf} onClick={() => setTimeframe(tf)}
                        className={`px-2 py-0.5 text-xs rounded ${timeframe === tf ? "bg-yellow-600 text-black font-bold" : "text-yellow-800 hover:text-yellow-500"}`}>
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scenario pills */}
                {forecastScenarios.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {forecastScenarios.map((s) => {
                      const lastVal = lastPoint[`s_${s.id}`] ?? 0;
                      const stat = s.type === "price" && s.targetPrice != null
                        ? `${fmtSOL(last.current)} SOL · ${fmtUSD(lastVal)} at $${s.targetPrice.toLocaleString()}`
                        : `${fmtSOL(lastVal)} SOL · ${fmtUSD(lastVal * data.solPrice)}`;
                      return (
                        <div key={s.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                          style={{ background: `${s.color}18`, border: `1px solid ${s.color}40`, color: s.color }}>
                          <span className="font-medium">{s.label}</span>
                          <span style={{ opacity: 0.7 }}>· {stat}</span>
                          <button onClick={() => setForecastScenarios((prev) => prev.filter((x) => x.id !== s.id))} style={{ opacity: 0.35 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
                    <XAxis dataKey="m" ticks={ticks} tickFormatter={fmtTick} tick={{ fill: "#a16207", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" hide domain={[(d: number) => d * 0.97, (d: number) => d * 1.03]} />
                    {hasPriceScenario && <YAxis yAxisId="right" hide orientation="right" domain={[(d: number) => d * 0.97, (d: number) => d * 1.03]} />}
                    <Tooltip
                      contentStyle={{ background: "#1c1400", border: "1px solid #a16207", borderRadius: 6, fontSize: 11 }}
                      labelFormatter={(m) => fmtTick(m as number)}
                      labelStyle={{ color: "#fbbf24" }}
                      formatter={(val, name) => {
                        const v = Number(val); const sname = String(name);
                        if (sname.startsWith("s_")) {
                          const scenario = forecastScenarios.find((s) => s.id === sname.slice(2));
                          if (!scenario) return [v, sname];
                          return scenario.type === "price"
                            ? [`${fmtSOL(last.current)} SOL · ${fmtUSD(v)}`, scenario.label]
                            : [`${fmtSOL(v)} SOL · ${fmtUSD(v * data.solPrice)}`, scenario.label];
                        }
                        return name === "optimized"
                          ? [`${fmtSOL(v)} SOL · ${fmtUSD(v * data.solPrice)}`, "+ idle deployed"]
                          : [`${fmtSOL(v)} SOL · ${fmtUSD(v * data.solPrice)}`, "Staked SOL"];
                      }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="current" stroke="#fbbf24" strokeWidth={2} dot={false} fill="none" isAnimationActive={false} />
                    {hasIdle && !noDeployed && (
                      <Line yAxisId="left" type="monotone" dataKey="optimized" stroke="#4ade80" strokeWidth={2} strokeDasharray="5 3" dot={false} fill="none" isAnimationActive={false} />
                    )}
                    {forecastScenarios.map((s) =>
                      s.type === "price"
                        ? <Line key={s.id} yAxisId="right" type="monotone" dataKey={`s_${s.id}`} stroke={s.color} strokeWidth={2} strokeDasharray="3 2" dot={false} fill="none" isAnimationActive={false} />
                        : <Line key={s.id} yAxisId="left" type="monotone" dataKey={`s_${s.id}`} stroke={s.color} strokeWidth={2} strokeDasharray="3 2" dot={false} fill="none" isAnimationActive={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* ── 5. REPLY THREAD ─────────────────────────────────── */}
              {(chatMessages.length > 0 || chatLoading) && (
                <div ref={threadRef} className="space-y-3 pb-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-purple-400">✦ AI</span>
                    {chatMessages.filter((m) => m.role === "assistant").length > 0 && (
                      <span className="text-xs text-gray-600">
                        {chatMessages.filter((m) => m.role === "assistant").length} repl{chatMessages.filter((m) => m.role === "assistant").length === 1 ? "y" : "ies"} ▲
                      </span>
                    )}
                  </div>
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] text-xs px-3 py-2.5 rounded-xl leading-relaxed ${
                        m.role === "user" ? "bg-gray-800 text-white" : "bg-gray-900 text-gray-300"
                      }`}>
                        {m.role === "assistant" && <p className="text-purple-400 font-medium mb-1">✦ AI</p>}
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-900 text-gray-600 text-xs px-3 py-2.5 rounded-xl">Thinking…</div>
                    </div>
                  )}
                </div>
              )}


            </div>
          );
        })()}

      </div>{/* end scrollable area */}

      {/* ── Fixed chip input — dormant by default, activates on focus ───── */}
      <div className="shrink-0 bg-black px-4 py-3">
        <div className={`flex items-center gap-3 border rounded-full px-4 py-2.5 transition-all ${
          chipFocused ? "border-purple-700" : "border-purple-700/50"
        }`}>
          <span className={`text-xs shrink-0 transition-colors ${chipFocused ? "text-purple-400" : "text-gray-600"}`}>✦</span>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onFocus={() => setChipFocused(true)}
            onBlur={() => setChipFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && sendUnified()}
            placeholder={inputPlaceholder}
            className={`flex-1 bg-transparent text-sm outline-none min-w-0 transition-colors ${
              chipFocused ? "text-white placeholder-gray-600" : "text-gray-500 placeholder-gray-600"
            }`}
          />
          {chipFocused && (
            <button
              onClick={sendUnified}
              disabled={!chatInput.trim() || chatLoading || !data}
              className="shrink-0 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
            >
              {chatLoading ? "…" : "Ask"}
            </button>
          )}
        </div>
      </div>

      {stakeModalOpen && data && (
        <NativeStakeModal
          onClose={() => setStakeModalOpen(false)}
          maxSOL={data.solBalance}
        />
      )}
      <BottomNav />
    </main>
  );
}
