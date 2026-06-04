import { NextResponse } from "next/server";

const PROTOCOLS = [
  { project: "jito-liquid-staking", symbol: "JITOSOL", label: "Jito", risk: "Low", liquidity: "Instant", url: "https://www.jito.network" },
  { project: "marinade-liquid-staking", symbol: "MSOL", label: "Marinade", risk: "Low", liquidity: "Instant", url: "https://marinade.finance" },
  { project: "jupiter-staked-sol", symbol: "JUPSOL", label: "Jupiter", risk: "Low", liquidity: "Instant", url: "https://jup.ag/perps/jupSOL" },
  { project: "drift-staked-sol", symbol: "DSOL", label: "Drift", risk: "Medium", liquidity: "Instant", url: "https://www.drift.trade" },
  { project: "blazestake", symbol: "BSOL", label: "BlazeStake", risk: "Low", liquidity: "Instant", url: "https://stake.solblaze.org" },
];

const NATIVE_STAKING = {
  label: "Native Staking",
  symbol: "SOL",
  apy: 6.5,
  tvlUsd: 40000000000,
  risk: "Very Low",
  liquidity: "2-3 days",
  url: "https://solanacompass.com/staking",
};

export async function GET() {
  try {
    const res = await fetch("https://yields.llama.fi/pools", { next: { revalidate: 300 } });
    const data = await res.json();

    const pools = data.data as Array<{
      project: string; symbol: string; apy: number; tvlUsd: number;
    }>;

    const results = PROTOCOLS.map((p) => {
      const pool = pools.find((pool) => pool.project === p.project && pool.symbol === p.symbol);
      return {
        label: p.label,
        symbol: p.symbol,
        apy: pool ? parseFloat(pool.apy.toFixed(2)) : null,
        tvlUsd: pool ? pool.tvlUsd : null,
        risk: p.risk,
        liquidity: p.liquidity,
        url: p.url,
      };
    }).filter((p) => p.apy !== null);

    return NextResponse.json([NATIVE_STAKING, ...results]);
  } catch {
    return NextResponse.json({ error: "Failed to fetch yields" }, { status: 500 });
  }
}
