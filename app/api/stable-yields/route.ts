import { NextResponse } from "next/server";

interface StableYield {
  protocol: string;
  apy: number;
  risk: string;
  url: string;
  tvlUsd: number;
}

const PROTOCOLS = [
  { slugs: ["kamino-finance", "kamino"],         label: "Kamino",       risk: "Very Low", url: "https://app.kamino.finance" },
  { slugs: ["marginfi"],                          label: "Marginfi",     risk: "Very Low", url: "https://app.marginfi.com"   },
  { slugs: ["drift-protocol", "drift"],           label: "Drift",        risk: "Very Low", url: "https://app.drift.trade"    },
  { slugs: ["solend", "save-finance"],            label: "Save",         risk: "Low",      url: "https://save.finance"       },
  { slugs: ["lulo"],                              label: "Lulo",         risk: "Low",      url: "https://lulo.finance"       },
  { slugs: ["meteora"],                           label: "Meteora",      risk: "Low",      url: "https://app.meteora.ag"     },
  { slugs: ["jupiter", "jupiter-lend"],           label: "Jupiter Lend", risk: "Low",      url: "https://jup.ag"             },
];

const TRACKED_SYMBOLS = new Set(["USDC", "USDT", "USDS", "PYUSD", "USDH", "PAI", "CASH", "JUPUSD"]);

export async function GET() {
  try {
    const res = await fetch("https://yields.llama.fi/pools", { next: { revalidate: 300 } });
    const json = await res.json();
    const pools: Array<{
      project: string;
      symbol: string;
      apy: number;
      tvlUsd: number;
      chain: string;
    }> = json.data;

    // Best APY per symbol → per protocol, single-asset Solana pools only
    const bySymbol: Record<string, StableYield[]> = {};

    for (const pool of pools) {
      if (
        pool.chain !== "Solana" ||
        pool.symbol.includes("-") ||        // skip LP pairs
        !TRACKED_SYMBOLS.has(pool.symbol.toUpperCase()) ||
        pool.tvlUsd < 100_000 ||
        pool.apy <= 0
      ) continue;

      const proto = PROTOCOLS.find(p => p.slugs.includes(pool.project));
      if (!proto) continue;

      const sym = pool.symbol.toUpperCase();
      if (!bySymbol[sym]) bySymbol[sym] = [];

      const existing = bySymbol[sym].find(r => r.protocol === proto.label);
      if (existing) {
        if (pool.apy > existing.apy) existing.apy = parseFloat(pool.apy.toFixed(2));
      } else {
        bySymbol[sym].push({
          protocol: proto.label,
          apy: parseFloat(pool.apy.toFixed(2)),
          risk: proto.risk,
          url: proto.url,
          tvlUsd: pool.tvlUsd,
        });
      }
    }

    // Sort each symbol's options by APY descending
    for (const sym of Object.keys(bySymbol)) {
      bySymbol[sym].sort((a, b) => b.apy - a.apy);
    }

    return NextResponse.json(bySymbol);
  } catch {
    return NextResponse.json({ error: "Failed to fetch stable yields" }, { status: 500 });
  }
}
