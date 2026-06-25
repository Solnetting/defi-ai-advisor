"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BottomNav from "../components/BottomNav";
import ChatPanel from "../components/ChatPanel";
import WalletButton from "../components/WalletButton";
import NativeStakeModal from "../components/NativeStakeModal";
import type { WalletData, YieldOption, StableYield } from "../lib/types";

interface Validator {
  vote_identity: string;
  name: string;
  commission: number;
  wiz_score: number;
  vote_success: number;
  activated_stake: number;
  is_jito: boolean;
  staking_apy?: number;
}

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

const SAFETY_LABEL: Record<string, string> = {
  "Very Low":    "Safe",
  "Low":         "Safe",
  "Medium":      "Moderate",
  "Medium–High": "Higher risk",
  "High":        "High risk",
};
const SAFETY_DOT: Record<string, string> = {
  "Very Low":    "bg-green-400",
  "Low":         "bg-green-300",
  "Medium":      "bg-yellow-400",
  "Medium–High": "bg-orange-400",
  "High":        "bg-red-400",
};
const SAFETY_MULT: Record<string, number> = {
  "Very Low": 1.00, "Low": 0.95, "Medium": 0.80, "Medium–High": 0.65, "High": 0.50,
};

function pickBest<T extends { apy: number; risk: string }>(options: T[]): T | null {
  const safe = options.filter(o => o.risk === "Very Low" || o.risk === "Low");
  const pool = safe.length > 0 ? safe : options;
  if (pool.length === 0) return null;
  return pool.reduce((best, o) =>
    o.apy * (SAFETY_MULT[o.risk] ?? 0.5) > best.apy * (SAFETY_MULT[best.risk] ?? 0.5) ? o : best
  );
}

export default function ExplorePage() {
  const { publicKey } = useWallet();
  const [yields, setYields] = useState<YieldOption[]>([]);
  const [stableYields, setStableYields] = useState<Record<string, StableYield[]>>({});
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [validators, setValidators] = useState<Validator[]>([]);
  const [stakeModalOpen, setStakeModalOpen] = useState(false);
  const [nativeExpanded, setNativeExpanded] = useState(false);
  const [showSolCriteria, setShowSolCriteria] = useState(false);
  const [showStableCriteria, setShowStableCriteria] = useState<string | null>(null);
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
      if (wData && !wData.error) setWalletData(wData);
    }).finally(() => setLoading(false));

    // Validators — same source as NativeStakeModal
    fetch("https://api.stakewiz.com/validators")
      .then((r) => r.json())
      .then((data: Validator[]) => {
        const top = data
          .filter((v) => !v.name?.includes("delinquent") && v.commission <= 10 && v.wiz_score > 50)
          .sort((a, b) => b.wiz_score - a.wiz_score)
          .slice(0, 30);
        setValidators(top);
      })
      .catch(() => {});
  }, [publicKey]);

  function validatorScore(v: Validator): number {
    return (v.vote_success / 100) * ((100 - v.commission) / 100) * (v.wiz_score / 100) * (v.is_jito ? 1.05 : 1);
  }
  const validatorAiPick = validators.length > 0
    ? validators.reduce((best, v) => validatorScore(v) > validatorScore(best) ? v : best)
    : null;

  const hasStables = walletData && (walletData.idleStables ?? []).length > 0;
  const stableSymbols = Object.keys(stableYields);
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

        {loading && <p className="text-gray-600 text-sm">Fetching live yields…</p>}

        {/* SOL staking yields */}
        {activeTab === "sol" && !loading && (() => {
          const solAiPick = pickBest(yields);
          return (
            <div className="space-y-4">
              {idleSOL > 0.001 && (
                <div className="bg-gray-950 border border-yellow-900/40 rounded-xl px-4 py-3">
                  <p className="text-xs text-yellow-600">
                    You have <span className="text-yellow-400 font-medium">{fmtSOL(idleSOL)} SOL idle</span>
                    {solPrice > 0 ? ` · $${Math.round(idleSOL * solPrice).toLocaleString()} not earning` : ""}
                  </p>
                </div>
              )}

              {/* ✦ AI Pick — best protocol by risk-adjusted APY */}
              {solAiPick && (
                <div
                  className="cursor-pointer bg-purple-950/40 border border-purple-800/50 rounded-xl px-4 py-3 active:bg-purple-950/60 transition-colors"
                  onClick={() => solAiPick.label === "Native Staking" ? setNativeExpanded(o => !o) : window.open(solAiPick.url, "_blank")}
                >
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <span className="text-purple-400 text-xs">✦</span>
                    <span className="text-purple-400 text-xs font-medium uppercase tracking-wide">AI Pick</span>
                    {solAiPick.label === "Native Staking" && validatorAiPick && (
                      <span className="text-[10px] text-purple-400 font-medium bg-purple-950/60 border border-purple-800/50 rounded-full px-1.5 py-px">
                        {validatorAiPick.name?.split(" ")[0] ?? validatorAiPick.vote_identity.slice(0, 6) + "…"}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowSolCriteria(s => !s); }}
                      className="text-purple-400/50 hover:text-purple-400 text-xs leading-none transition-colors"
                      aria-label="How was this picked?"
                    >ⓘ</button>
                  </div>
                  {showSolCriteria && (
                    <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
                      Picks the highest yield in the safest tier. A 4% safe option beats a 5% risky one — safety is weighted first, then APY.
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{solAiPick.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {SAFETY_LABEL[solAiPick.risk] ?? solAiPick.risk} · {solAiPick.liquidity}
                        {idleSOL > 0.001 ? ` · +${(idleSOL * solAiPick.apy / 100).toFixed(3)} SOL/yr` : ""}
                      </p>
                    </div>
                    <p className="text-base font-bold text-green-400">{solAiPick.apy.toFixed(2)}%</p>
                  </div>
                </div>
              )}

              {/* Protocol list — each is a tappable card, Native Staking expands to show validators */}
              <p className="text-xs text-gray-700 px-1">All options</p>
              <div className="space-y-2">
                {yields.map((y) => {
                  const yearlySOL = idleSOL > 0.001 ? idleSOL * (y.apy / 100) : null;
                  const isNative = y.label === "Native Staking";

                  return (
                    <div key={y.label} className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                      {/* Tappable protocol card */}
                      <div
                        className="px-4 py-3 cursor-pointer hover:bg-gray-900 active:bg-gray-800 transition-colors"
                        onClick={() => isNative ? setNativeExpanded(o => !o) : window.open(y.url, "_blank")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{y.label}</p>
                              <div className="flex items-center gap-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${SAFETY_DOT[y.risk] ?? "bg-gray-500"}`} />
                                <span className="text-xs text-gray-500">{SAFETY_LABEL[y.risk] ?? y.risk}</span>
                              </div>
                            </div>
                            <p className="text-xs text-gray-600 mt-0.5">{y.liquidity} · TVL {fmtTVL(y.tvlUsd)}</p>
                            {yearlySOL && (
                              <p className="text-xs text-green-600 mt-1">+{yearlySOL.toFixed(3)} SOL/yr on your idle</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-bold text-white">{y.apy.toFixed(2)}%</p>
                            {isNative && (
                              <p className="text-[10px] text-gray-700 mt-0.5">{nativeExpanded ? "↑ collapse" : "↓ validators"}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Validator list — expands inside Native Staking card */}
                      {isNative && nativeExpanded && (
                        <div className="border-t border-gray-900">
                          {validators.length === 0 ? (
                            <p className="text-xs text-gray-700 px-5 py-3">Loading validators…</p>
                          ) : (
                            <>
                              <div className="divide-y divide-gray-900">
                                {validators.slice(0, 10).map((v) => {
                                  const isVPick = v.vote_identity === validatorAiPick?.vote_identity;
                                  return (
                                    <div key={v.vote_identity}
                                      onClick={() => setStakeModalOpen(true)}
                                      className={`pl-5 pr-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${isVPick ? "bg-purple-950/30 hover:bg-purple-950/40" : "hover:bg-gray-900"}`}>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="text-xs font-medium truncate">{v.name || v.vote_identity.slice(0, 12) + "…"}</p>
                                          {isVPick && <span className="text-[9px] text-purple-400 font-medium shrink-0 uppercase tracking-wide">✦ Pick</span>}
                                        </div>
                                        <p className="text-[10px] text-gray-700 mt-0.5">
                                          {v.commission}% fee · Score {v.wiz_score.toFixed(0)}{v.is_jito ? " · Jito" : ""}
                                        </p>
                                      </div>
                                      <span className="text-xs text-green-400 tabular-nums shrink-0">{v.vote_success.toFixed(1)}%</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <button onClick={() => setStakeModalOpen(true)}
                                className="w-full py-2.5 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors border-t border-gray-900">
                                Stake with AI Pick →
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Stablecoin yields */}
        {activeTab === "stables" && !loading && (
          <div className="space-y-4">
            {/* Idle stables banner — only if wallet has idle stables */}
            {hasStables && (
              <div className="bg-gray-950 border border-yellow-900/40 rounded-xl px-4 py-3">
                <p className="text-xs text-yellow-600">
                  <span className="text-yellow-400 font-medium">
                    ${Math.round((walletData?.idleStables ?? []).reduce((s, st) => s + st.usd, 0)).toLocaleString()} idle stablecoins
                  </span>
                  {" "}· not earning yield
                </p>
              </div>
            )}

            {stableSymbols.length === 0 && (
              <p className="text-gray-600 text-sm">Fetching stable yield data…</p>
            )}

            {stableSymbols.map((sym) => {
              const options = stableYields[sym] ?? [];
              const aiPick = pickBest(options);
              const walletStable = (walletData?.idleStables ?? []).find(s => s.symbol === sym);
              const idleUsd = walletStable?.usd ?? 0;
              return (
                <div key={sym} className="space-y-2">
                  {/* ✦ AI Pick for this stable */}
                  {aiPick && (
                    <div className="bg-purple-950/40 border border-purple-800/50 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-purple-400 text-xs">✦</span>
                        <span className="text-purple-400 text-xs font-medium uppercase tracking-wide">AI Pick · {sym}</span>
                        <button
                          onClick={() => setShowStableCriteria(s => s === sym ? null : sym)}
                          className="text-purple-400/50 hover:text-purple-400 text-xs leading-none transition-colors"
                          aria-label="How was this picked?"
                        >ⓘ</button>
                      </div>
                      {showStableCriteria === sym && (
                        <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
                          Picks the highest yield in the safest tier. A 4% safe option beats a 5% risky one — safety is weighted first, then APY.
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{aiPick.protocol}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {SAFETY_LABEL[aiPick.risk] ?? aiPick.risk} · TVL {fmtTVL(aiPick.tvlUsd)}
                            {idleUsd > 0 && ` · +$${(idleUsd * aiPick.apy / 100).toFixed(2)}/yr`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-green-400">{aiPick.apy.toFixed(2)}%</p>
                          <a href={aiPick.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium">
                            Deploy ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-900">
                      <p className="text-xs text-gray-400 font-medium">{sym} · All options</p>
                      {idleUsd > 0 && (
                        <p className="text-xs text-gray-600">${idleUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} idle</p>
                      )}
                    </div>
                    {options.length === 0 && (
                      <p className="text-xs text-gray-700 px-4 py-3">No yield data available</p>
                    )}
                    <div className="divide-y divide-gray-900">
                      {options.slice(0, 5).map((opt) => {
                        const yearlyUsd = idleUsd * (opt.apy / 100);
                        const isAiPick = opt.protocol === aiPick?.protocol;
                        return (
                          <div key={opt.protocol} className={`px-4 py-3 flex items-start justify-between gap-3 ${isAiPick ? "bg-purple-950/20" : ""}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{opt.protocol}</p>
                                <div className="flex items-center gap-1">
                                  <div className={`w-1.5 h-1.5 rounded-full ${SAFETY_DOT[opt.risk] ?? "bg-gray-500"}`} />
                                  <span className="text-xs text-gray-500">{SAFETY_LABEL[opt.risk] ?? opt.risk}</span>
                                </div>
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
                </div>
              );
            })}
          </div>
        )}

      </div>
      {stakeModalOpen && (
        <NativeStakeModal
          onClose={() => setStakeModalOpen(false)}
          maxSOL={walletData?.solBalance ?? 0}
        />
      )}

      <ChatPanel
        placeholder="Compare protocols, ask about risk or APY…"
        context={[
          yields.length > 0
            ? `Live SOL staking yields: ${yields.map(y => `${y.label} ${y.apy.toFixed(2)}% APY (${y.risk} risk)`).join(", ")}`
            : "",
          walletData && walletData.stakedSOL > 0
            ? `User has ${walletData.stakedSOL.toFixed(3)} staked SOL ($${Math.round(walletData.stakedSOL * walletData.solPrice)}) currently earning yield.`
            : "",
          walletData && walletData.idleSOL > 0.001
            ? `User has ${walletData.idleSOL.toFixed(3)} idle SOL ($${Math.round(walletData.idleSOL * walletData.solPrice)}) not earning yield.`
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
