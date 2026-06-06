import { NextResponse } from "next/server";

const PROTOCOLS = [
  { project: "jito-liquid-staking", symbol: "JITOSOL", label: "Jito", risk: "Low", liquidity: "Instant", url: "https://www.jito.network" },
  { project: "marinade-liquid-staking", symbol: "MSOL", label: "Marinade", risk: "Low", liquidity: "Instant", url: "https://marinade.finance" },
  { project: "jupiter-staked-sol", symbol: "JUPSOL", label: "Jupiter", risk: "Low", liquidity: "Instant", url: "https://jup.ag/perps/jupSOL" },
  { project: "drift-staked-sol", symbol: "DSOL", label: "Drift", risk: "Medium", liquidity: "Instant", url: "https://www.drift.trade" },
  { project: "blazestake", symbol: "BSOL", label: "BlazeStake", risk: "Low", liquidity: "Instant", url: "https://stake.solblaze.org" },
];

async function getNativeStakingAPY(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.stakewiz.com/validators",
      { next: { revalidate: 300 } }
    );
    const validators = await res.json();
    const apys: number[] = (Array.isArray(validators) ? validators : [])
      .filter((v: { delinquent?: boolean; commission?: number; wiz_score?: number }) =>
        !v.delinquent && (v.commission ?? 100) <= 10 && (v.wiz_score ?? 0) >= 50
      )
      .map((v: { staking_apy?: number }) => v.staking_apy)
      .filter((a: number | undefined): a is number => typeof a === "number" && a > 0);

    if (apys.length === 0) return 5.65;
    apys.sort((a, b) => a - b);
    const mid = Math.floor(apys.length / 2);
    const median = apys.length % 2 !== 0 ? apys[mid] : (apys[mid - 1] + apys[mid]) / 2;
    return parseFloat(median.toFixed(2));
  } catch {
    return 5.65;
  }
}

export async function GET() {
  try {
    const [llamaRes, nativeAPY] = await Promise.all([
      fetch("https://yields.llama.fi/pools", { next: { revalidate: 300 } }),
      getNativeStakingAPY(),
    ]);

    const data = await llamaRes.json();
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

    const nativeStaking = {
      label: "Native Staking",
      symbol: "SOL",
      apy: nativeAPY,
      tvlUsd: 40000000000,
      risk: "Very Low",
      liquidity: "2-3 days",
      url: "https://solanacompass.com/staking",
    };

    return NextResponse.json([nativeStaking, ...results]);
  } catch {
    return NextResponse.json({ error: "Failed to fetch yields" }, { status: 500 });
  }
}
