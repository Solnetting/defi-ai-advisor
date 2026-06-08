"use client";

import { useState } from "react";
import type { StableYield } from "../lib/types";

interface Props {
  symbol: string;
  idleUsd: number;
  options: StableYield[];
  onClose: () => void;
}

// Plain-language safety labels — "Very Low risk" is jargon; "Safe" is not
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
// Penalty multiplier: safe options score higher than risky ones at the same APY
const SAFETY_MULT: Record<string, number> = {
  "Very Low": 1.00,
  "Low":      0.95,
  "Medium":   0.80,
  "Medium–High": 0.65,
  "High":     0.50,
};

function fmtTVL(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${Math.round(usd / 1e3)}K`;
}

// Best safe option by risk-adjusted APY (favours safety for beginners)
function pickBest(options: StableYield[]): StableYield | null {
  const safe = options.filter(o => o.risk === "Very Low" || o.risk === "Low");
  const pool = safe.length > 0 ? safe : options;
  if (pool.length === 0) return null;
  return pool.reduce((best, o) =>
    o.apy * (SAFETY_MULT[o.risk] ?? 0.5) > best.apy * (SAFETY_MULT[best.risk] ?? 0.5) ? o : best
  );
}

export default function StableYieldModal({ symbol, idleUsd, options, onClose }: Props) {
  const aiPick = pickBest(options);
  const [showCriteria, setShowCriteria] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-gray-950 border border-gray-800 rounded-t-2xl w-full max-w-[390px] max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="font-semibold">Deploy {symbol}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              ${idleUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} idle · pick a protocol
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg">✕</button>
        </div>

        {/* ✦ AI Pick */}
        {aiPick && (
          <div className="mx-5 mt-4 mb-1 bg-purple-950/40 border border-purple-800/50 rounded-xl px-4 py-3 shrink-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-purple-400 text-xs">✦</span>
              <span className="text-purple-400 text-xs font-medium uppercase tracking-wide">AI Pick</span>
              <button
                onClick={() => setShowCriteria(s => !s)}
                className="text-purple-400/50 hover:text-purple-400 text-xs leading-none transition-colors"
                aria-label="How was this picked?"
              >ⓘ</button>
            </div>
            {showCriteria && (
              <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
                Picks the highest yield in the safest tier. A 4% safe option beats a 5% risky one — safety is weighted first, then APY.
              </p>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{aiPick.protocol}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Best safe yield · {SAFETY_LABEL[aiPick.risk] ?? aiPick.risk} · {fmtTVL(aiPick.tvlUsd)} TVL
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-green-400">{aiPick.apy.toFixed(2)}% APY</p>
                <a href={aiPick.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:text-purple-300 font-medium">
                  Deposit ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Column headers */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-gray-900 mt-3 shrink-0">
          <span className="text-xs text-gray-700 w-28">Protocol</span>
          <span className="text-xs text-gray-700 text-right w-12">APY</span>
          <span className="text-xs text-gray-700 text-right w-16">Safety</span>
          <span className="text-xs text-gray-700 text-right w-14">TVL</span>
          <span className="text-xs text-gray-700 text-right w-14">Yearly</span>
          <span className="w-16" />
        </div>

        {/* Protocol list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-900">
          {options.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-10">No yield data available</p>
          )}
          {options.map((opt) => {
            const yearlyUsd = idleUsd * (opt.apy / 100);
            const yearlyFmt = yearlyUsd < 0.01 ? "<$0.01"
              : yearlyUsd < 10 ? `$${yearlyUsd.toFixed(2)}`
              : `$${Math.round(yearlyUsd).toLocaleString()}`;
            const isAiPick = opt.protocol === aiPick?.protocol;

            return (
              <div key={opt.protocol}
                className={`flex items-center justify-between px-5 py-3.5 transition-colors ${isAiPick ? "bg-purple-950/20" : "hover:bg-gray-900"}`}>
                <div className="w-28">
                  <p className="text-sm font-medium">{opt.protocol}</p>
                </div>
                <p className="text-sm font-bold text-white text-right w-12">{opt.apy.toFixed(2)}%</p>
                <div className="flex items-center justify-end gap-1.5 w-16">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${SAFETY_DOT[opt.risk] ?? "bg-gray-500"}`} />
                  <p className="text-xs text-gray-400">{SAFETY_LABEL[opt.risk] ?? opt.risk}</p>
                </div>
                <p className="text-xs text-gray-500 text-right w-14">{fmtTVL(opt.tvlUsd)}</p>
                <p className="text-xs text-green-700 text-right w-14">+{yearlyFmt}/yr</p>
                <a
                  href={opt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-16 text-right text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium"
                >
                  Deposit ↗
                </a>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t border-gray-900 shrink-0">
          <p className="text-xs text-gray-700 text-center">
            APY from DeFiLlama · single-asset Solana pools only · non-custodial
          </p>
        </div>

      </div>
    </div>
  );
}
