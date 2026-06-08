import { NextRequest, NextResponse } from "next/server";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE = "https://api.helius.xyz/v0";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const SOL_MINT = "So11111111111111111111111111111111111111112";

const STABLE_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",  // USDS
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", // PYUSD
  "USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX",  // USDH
  "Ea5SjE2Y6yvjfxjdiYkPiJwrR9wZkHTMGW3kuk35MoRT", // PAI
  // TODO: replace with confirmed on-chain mints once available
  // "???", // CASH
  // "???", // JupUSD
]);

// Display symbol for each known stable mint
const STABLE_SYMBOLS: Record<string, string> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB":  "USDT",
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA":  "USDS",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  "USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX":  "USDH",
  "Ea5SjE2Y6yvjfxjdiYkPiJwrR9wZkHTMGW3kuk35MoRT": "PAI",
};

interface KaminoPosition {
  name: string;
  type: string;
  tokenSymbol: string | null;
  amountSOL: number;
  netValueUsd: number;
  apy: number | null;
}

async function getKaminoPositions(address: string): Promise<KaminoPosition[]> {
  try {
    const res = await fetch(`https://api.kamino.finance/portfolio/${address}`);
    const data = await res.json();
    const positions: KaminoPosition[] = [];

    for (const type of ["earn", "lending", "liquidity", "multiply"]) {
      for (const pos of data[type] ?? []) {
        const amountSOL =
          pos.vaultTokenMint === SOL_MINT ? parseFloat(pos.amount ?? "0") : 0;
        const netValueUsd = parseFloat(pos.netValue ?? "0");
        // Try every known APY field Kamino uses across position types
        const rawApy =
          pos.supplyApy ?? pos.netApy ?? pos.apy ?? pos.totalApy ??
          pos.apy24h ?? pos.apr ?? pos.supplyInterestRate ?? null;
        const apy = rawApy !== null ? parseFloat(rawApy) * 100 : null;
        // Extract token symbol from multiple possible fields
        const tokenSymbol =
          pos.tokenSymbol ?? pos.symbol ?? pos.token ?? pos.assetSymbol ?? null;
        // Build a human name — prefer vault/market name, fall back to token symbol + type
        const rawName =
          pos.vaultName ?? pos.marketName ?? pos.strategyName ??
          pos.name ?? null;
        const name = rawName ?? (tokenSymbol ? `${tokenSymbol} ${type}` : type);
        if (amountSOL > 0 || netValueUsd > 0.01) {
          positions.push({
            name,
            type,
            tokenSymbol,
            amountSOL,
            netValueUsd,
            apy: apy && isFinite(apy) && apy > 0 ? Math.round(apy * 100) / 100 : null,
          });
        }
      }
    }

    return positions;
  } catch {
    return [];
  }
}

async function getSolPrice(): Promise<{ price: number; change24h: number }> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true",
      { next: { revalidate: 60 } }
    );
    const json = await res.json();
    return { price: json.solana?.usd ?? 0, change24h: json.solana?.usd_24h_change ?? 0 };
  } catch {
    return { price: 0, change24h: 0 };
  }
}

async function getStakedSOL(address: string): Promise<{ total: number; status: string; epochHoursRemaining: number }> {
  const STAKE_PROGRAM = "Stake11111111111111111111111111111111111111";

  try {
    // Query stake accounts directly via getProgramAccounts with memcmp filters.
    // Stake account binary layout (bincode): 4-byte variant | 8-byte rent_exempt_reserve
    // | 32-byte staker (offset 12) | 32-byte withdrawer (offset 44) | …
    // Run both filters + epoch info in parallel and deduplicate results.
    const [epochRes, stakerRes, withdrawerRes] = await Promise.all([
      fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "epoch", method: "getEpochInfo", params: [] }),
      }).then((r) => r.json()),
      fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: "staker",
          method: "getProgramAccounts",
          params: [STAKE_PROGRAM, { encoding: "jsonParsed", filters: [{ memcmp: { offset: 12, bytes: address } }] }],
        }),
      }).then((r) => r.json()),
      fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: "withdrawer",
          method: "getProgramAccounts",
          params: [STAKE_PROGRAM, { encoding: "jsonParsed", filters: [{ memcmp: { offset: 44, bytes: address } }] }],
        }),
      }).then((r) => r.json()),
    ]);

    const currentEpoch: number = epochRes.result?.epoch ?? 0;
    const slotIndex: number = epochRes.result?.slotIndex ?? 0;
    const slotsInEpoch: number = epochRes.result?.slotsInEpoch ?? 432000;
    const epochHoursRemaining = Math.max(1, Math.round((slotsInEpoch - slotIndex) * 0.4 / 3600));
    const MAX_EPOCH = BigInt("18446744073709551615");

    // Deduplicate by pubkey (staker == withdrawer for most user-owned accounts)
    const seen = new Set<string>();
    const accounts: Array<{ lamports: number; data: { parsed?: { info?: { stake?: { delegation?: Record<string, string> } } } } }> = [];
    for (const entry of [...(stakerRes.result ?? []), ...(withdrawerRes.result ?? [])]) {
      if (!seen.has(entry.pubkey)) {
        seen.add(entry.pubkey);
        accounts.push(entry.account);
      }
    }

    if (accounts.length === 0) return { total: 0, status: "Inactive", epochHoursRemaining };

    let total = 0;
    const statuses = new Set<string>();

    for (const acc of accounts) {
      total += acc.lamports ?? 0;
      const delegation = acc.data?.parsed?.info?.stake?.delegation;
      if (delegation) {
        const activationEpoch = Number(delegation.activationEpoch ?? 0);
        const deactivationStr = delegation.deactivationEpoch ?? MAX_EPOCH.toString();
        const deactivationEpoch = BigInt(deactivationStr);
        if (deactivationEpoch < MAX_EPOCH && Number(deactivationEpoch) <= currentEpoch) {
          statuses.add("Inactive");
        } else if (deactivationEpoch < MAX_EPOCH) {
          statuses.add("Deactivating");
        } else if (activationEpoch >= currentEpoch) {
          statuses.add("Activating");
        } else {
          statuses.add("Active");
        }
      }
    }

    const status = statuses.has("Deactivating") ? "Deactivating"
      : statuses.has("Activating") ? "Activating"
      : statuses.has("Active") ? "Active"
      : "Inactive";

    return { total: total / 1e9, status, epochHoursRemaining };
  } catch {
    return { total: 0, status: "Active", epochHoursRemaining: 0 };
  }
}

interface IdleStable {
  symbol: string;
  mint: string;
  usd: number;
}

async function getStakedJUP(address: string): Promise<{ amount: number; usd: number; unstakingAmount: number; jupPrice: number }> {
  try {
    const [stakingRes, priceRes] = await Promise.all([
      fetch(`https://api.jup.ag/portfolio/v1/staked-jup/${address}`, { next: { revalidate: 60 } }),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=jupiter-exchange-solana&vs_currencies=usd", { next: { revalidate: 60 } }),
    ]);
    const staking = await stakingRes.json();
    const priceData = await priceRes.json();
    const jupPrice: number = priceData?.["jupiter-exchange-solana"]?.usd ?? 0;
    // Jupiter portfolio API returns stakedAmount already in human-readable JUP (not micro-units)
    const stakedAmount: number = staking.stakedAmount ?? 0;
    const unstakingAmount: number = (staking.unstaking ?? []).reduce(
      (s: number, u: { amount?: number }) => s + (u.amount ?? 0),
      0
    );
    return { amount: stakedAmount, usd: stakedAmount * jupPrice, unstakingAmount, jupPrice };
  } catch {
    return { amount: 0, usd: 0, unstakingAmount: 0, jupPrice: 0 };
  }
}

const TOKEN_SYMBOL: Record<string, string> = {
  "So11111111111111111111111111111111111111112": "SOL",
  "3NZ9JMVXkeihGaKdEiF1jsHt5LEgkVRQQjJQ1zwsRpZT": "BTC",  // cbBTC — Jupiter Perps primary
  "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": "BTC",  // wBTC legacy
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",  // Wormhole wETH
  "2FPyTwcZLUgFDPkudBcsbKDsHpQxNRtKFXJGTpq6BEfp": "ETH",  // allbridge ETH
};

async function getJupiterPerpPositions(address: string): Promise<import("../../lib/types").PerpPosition[]> {
  try {
    const res = await fetch(`https://api.jup.ag/portfolio/v1/positions/${address}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const positions: import("../../lib/types").PerpPosition[] = [];

    for (const el of data.elements ?? []) {
      if (el.type !== "leverage") continue;
      for (const pos of el.data?.isolated?.positions ?? []) {
        const mint: string = pos.address ?? "";
        positions.push({
          tokenMint: mint,
          tokenSymbol: TOKEN_SYMBOL[mint] ?? mint.slice(0, 4),
          side: pos.side === "short" ? "short" : "long",
          leverage: Number(pos.leverage ?? 1),
          entryPrice: Number(pos.entryPrice ?? 0),
          markPrice: Number(pos.markPrice ?? 0),
          liquidationPrice: Number(pos.liquidationPrice ?? 0),
          collateralUsd: Number(pos.collateralValue ?? 0),
          sizeUsd: Number(pos.sizeValue ?? 0),
          pnlUsd: Number(pos.pnlValue ?? 0),
          netValueUsd: Number(pos.value ?? 0),
          stopLoss: pos.sl ? Number(pos.sl) : null,
        });
      }
    }
    return positions;
  } catch {
    return [];
  }
}

async function getTokenBreakdown(
  tokens: { mint: string; amount: number; decimals: number }[]
): Promise<{ stableUsd: number; otherUsd: number; idleStables: IdleStable[]; priceMap: Record<string, number> }> {
  let stableUsd = 0;
  const idleStables: IdleStable[] = [];
  const nonStable: typeof tokens = [];
  const priceMap: Record<string, number> = {};

  for (const t of tokens) {
    const amt = t.amount / Math.pow(10, t.decimals);
    if (STABLE_MINTS.has(t.mint)) {
      stableUsd += amt;
      priceMap[t.mint] = 1;
      if (amt >= 0.01) {
        idleStables.push({
          symbol: STABLE_SYMBOLS[t.mint] ?? "STABLE",
          mint: t.mint,
          usd: Math.round(amt * 100) / 100,
        });
      }
    } else {
      nonStable.push(t);
    }
  }

  let otherUsd = 0;
  if (nonStable.length > 0) {
    try {
      const ids = nonStable.map((t) => t.mint).join(",");
      const res = await fetch(`https://price.jup.ag/v6/price?ids=${ids}`, {
        next: { revalidate: 60 },
      });
      const json = await res.json();
      for (const t of nonStable) {
        const price = parseFloat(json?.data?.[t.mint]?.price ?? "0");
        priceMap[t.mint] = price;
        otherUsd += (t.amount / Math.pow(10, t.decimals)) * price;
      }
    } catch {
      // skip if price fetch fails — otherUsd stays 0
    }
  }

  return { stableUsd, otherUsd, idleStables, priceMap };
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "No address provided" }, { status: 400 });

  try {
    const [balancesRes, stakedResult, solPriceData, kaminoPositions, stakedJup, perpPositions] = await Promise.all([
      fetch(`${HELIUS_BASE}/addresses/${address}/balances?api-key=${HELIUS_API_KEY}`),
      getStakedSOL(address),
      getSolPrice(),
      getKaminoPositions(address),
      getStakedJUP(address),
      getJupiterPerpPositions(address),
    ]);
    const stakedSOL = stakedResult.total;
    const stakeStatus = stakedResult.status;
    const epochHoursRemaining = stakedResult.epochHoursRemaining;
    const { price: solPrice, change24h: solPrice24hChange } = solPriceData;

    const data = await balancesRes.json();
    const solBalance = (data.nativeBalance ?? 0) / 1e9;
    const kaminoSOL = kaminoPositions.reduce((sum, p) => sum + p.amountSOL, 0);
    // solBalance from Helius is the native wallet balance only — staked and Kamino SOL
    // are already in separate program accounts, not included in nativeBalance
    const idleSOL = solBalance;
    const rawTokens = (data.tokens ?? []).filter((t: { amount: number }) => t.amount > 0);

    const mints = rawTokens.map((t: { mint: string }) => t.mint);
    const chunkSize = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < mints.length; i += chunkSize) {
      chunks.push(mints.slice(i, i + chunkSize));
    }

    // Run token metadata (all chunks) + token price breakdown in parallel
    const [tokenBreakdown, ...metaResults] = await Promise.all([
      getTokenBreakdown(rawTokens),
      ...chunks.map((chunk) =>
        fetch(`${HELIUS_BASE}/token-metadata?api-key=${HELIUS_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mintAccounts: chunk, includeOffChain: true, disableCache: false }),
        })
          .then((r) => r.json())
          .catch(() => [])
      ),
    ]);

    const metaMap: Record<string, { name: string; symbol: string; logoURI: string | null }> = {};
    for (const metaData of metaResults) {
      if (Array.isArray(metaData)) {
        for (const item of metaData) {
          const mint = item.account;
          const name =
            item.onChainMetadata?.metadata?.data?.name?.replace(/\0/g, "").trim() || null;
          const symbol =
            item.onChainMetadata?.metadata?.data?.symbol?.replace(/\0/g, "").trim() || null;
          const rawLogo =
            item.legacyMetadata?.logoURI ??
            item.offChainMetadata?.metadata?.image ??
            item.offChainMetadata?.metadata?.logoURI ??
            null;
          // Transform ipfs:// URIs to a public HTTP gateway
          const logoURI = rawLogo?.startsWith("ipfs://")
            ? `https://ipfs.io/ipfs/${rawLogo.slice(7)}`
            : rawLogo;
          if (mint) metaMap[mint] = { name, symbol, logoURI: logoURI ?? null };
        }
      }
    }

    const tokens = rawTokens
      .map((t: { mint: string; amount: number; decimals: number }) => {
        const price = tokenBreakdown.priceMap[t.mint] ?? 0;
        return {
          mint: t.mint,
          amount: t.amount,
          decimals: t.decimals,
          name: metaMap[t.mint]?.name ?? null,
          symbol: metaMap[t.mint]?.symbol ?? null,
          logoURI: metaMap[t.mint]?.logoURI ?? null,
          usdValue: (t.amount / Math.pow(10, t.decimals)) * price,
        };
      })
      .sort((a: { usdValue: number }, b: { usdValue: number }) => b.usdValue - a.usdValue);

    return NextResponse.json({
      solBalance,
      stakedSOL,
      stakeStatus,
      kaminoSOL,
      idleSOL,
      solPrice,
      solPrice24hChange,
      epochHoursRemaining,
      kaminoPositions,
      tokens,
      stableUsd: tokenBreakdown.stableUsd,
      otherUsd: tokenBreakdown.otherUsd,
      idleStables: tokenBreakdown.idleStables,
      stakedJup,
      perpPositions,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch wallet data" }, { status: 500 });
  }
}
