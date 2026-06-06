"use client";

import type { StableYield } from "../lib/types";

interface Props {
  symbol: string;
  idleUsd: number;
  options: StableYield[];
  onClose: () => void;
}

const RISK_COLOR: Record<string, string> = {
  "Very Low": "text-green-400",
  "Low": "text-green-300",
  "Medium": "text-yellow-400",
  "Medium–High": "text-orange-400",
  "High": "text-red-400",
};

function fmtTVL(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${Math.round(usd / 1e3)}K`;
}

export default function StableYieldModal({ symbol, idleUsd, options, onClose }: Props) {
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

        {/* Column headers */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-gray-900 shrink-0">
          <span className="text-xs text-gray-700 w-28">Protocol</span>
          <span className="text-xs text-gray-700 text-right w-12">APY</span>
          <span className="text-xs text-gray-700 text-right w-16">Risk</span>
          <span className="text-xs text-gray-700 text-right w-14">TVL</span>
          <span className="text-xs text-gray-700 text-right w-14">Yearly</span>
          <span className="w-16" />
        </div>

        {/* Protocol list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-900">
          {options.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-10">No yield data available</p>
          )}
          {options.map((opt, i) => {
            const yearlyUsd = idleUsd * (opt.apy / 100);
            const yearlyFmt = yearlyUsd < 0.01 ? "<$0.01"
              : yearlyUsd < 10 ? `$${yearlyUsd.toFixed(2)}`
              : `$${Math.round(yearlyUsd).toLocaleString()}`;

            return (
              <div key={opt.protocol}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-900 transition-colors">
                <div className="w-28">
                  <div className="flex items-center gap-1.5">
                    {i === 0 && (
                      <span className="text-xs bg-purple-900/50 text-purple-400 px-1.5 py-0.5 rounded text-[10px] font-medium">Best</span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-0.5">{opt.protocol}</p>
                </div>
                <p className="text-sm font-bold text-white text-right w-12">{opt.apy.toFixed(2)}%</p>
                <p className={`text-xs text-right w-16 ${RISK_COLOR[opt.risk] ?? "text-gray-400"}`}>{opt.risk}</p>
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
