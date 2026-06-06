import { NextResponse } from "next/server";

interface StableYield {
  protocol: string;
  apy: number;
  risk: string;
  url: string;
  tvlUsd: number;
}

function depositUrl(label: string, sym: string): string {
  switch (label) {
    case "Jupiter Lend":  return `https://jup.ag/lend/earn?symbol=${sym}&action=deposit`;
    case "Kamino":        return `https://app.kamino.finance/lending/earn`;
    case "Save":          return `https://save.finance/dashboard`;
    case "Loopscale":     return `https://app.loopscale.com/lend`;
    case "Marginfi":      return `https://app.marginfi.com/lend`;
    case "Drift":         return `https://app.drift.trade/earn`;
    case "Lulo":          return `https://lulo.finance`;
    case "Meteora":       return `https://app.meteora.ag/vaults`;
    default:              return `https://defillama.com/yields?chain=Solana&token=${sym}`;
  }
}

const PROTOCOLS = [
  { slugs: ["jupiter-lend"],                    label: "Jupiter Lend", risk: "Low"      },
  { slugs: ["kamino-lend", "kamino-finance"],    label: "Kamino",       risk: "Very Low" },
  { slugs: ["save", "solend", "save-finance"],   label: "Save",         risk: "Low"      },
  { slugs: ["loopscale"],                        label: "Loopscale",    risk: "Low"      },
  { slugs: ["marginfi"],                         label: "Marginfi",     risk: "Very Low" },
  { slugs: ["drift-protocol", "drift"],          label: "Drift",        risk: "Very Low" },
  { slugs: ["lulo"],                             label: "Lulo",         risk: "Low"      },
  { slugs: ["meteora", "meteora-dlmm"],          label: "Meteora",      risk: "Low"      },
];

const TRACKED_SYMBOLS = new Set(["USDC", "USDT", "USDS", "PYUSD", "USDH", "PAI", "CASH", "JUPUSD"]);

export async function GET() {
  try {
    const res = await fetch("https://yields.llama.fi/pools", { cache: "no-store" });
    const json = await res.json();
    const pools: Array<{
      project: string;
      symbol: string;
      apy: number;
      tvlUsd: number;
      chain: string;
    }> = json.data;

    const bySymbol: Record<string, StableYield[]> = {};

    for (const pool of pools) {
      if (
        pool.chain !== "Solana" ||
        pool.symbol.includes("-") ||
        !TRACKED_SYMBOLS.has(pool.symbol.toUpperCase()) ||
        pool.tvlUsd < 100_000 ||
        pool.apy <= 0 ||
        pool.apy > 100   // filter obvious outliers / bad data
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
          url: depositUrl(proto.label, sym),
          tvlUsd: pool.tvlUsd,
        });
      }
    }

    for (const sym of Object.keys(bySymbol)) {
      bySymbol[sym].sort((a, b) => b.apy - a.apy);
    }

    return NextResponse.json(bySymbol);
  } catch {
    return NextResponse.json({ error: "Failed to fetch stable yields" }, { status: 500 });
  }
}
