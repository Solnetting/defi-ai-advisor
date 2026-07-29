import { NextRequest, NextResponse } from "next/server";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const SOL_MINT = "So11111111111111111111111111111111111111112";

const STABLE_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",  // USDS
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", // PYUSD
  "USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX",  // USDH
  "Ea5SjE2Y6yvjfxjdiYkPiJwrR9wZkHTMGW3kuk35MoRT", // PAI
  "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD",  // JupUSD — Jupiter yield-bearing USD, $1-pegged (CoinGecko confirmed)
]);

// Display symbol for each known stable mint
const STABLE_SYMBOLS: Record<string, string> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB":  "USDT",
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA":  "USDS",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  "USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX":  "USDH",
  "Ea5SjE2Y6yvjfxjdiYkPiJwrR9wZkHTMGW3kuk35MoRT": "PAI",
  "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD":  "JupUSD",
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
  "3NZ9JMVXkeihGaKdEiF1jsHt5LEgkVRQQjJQ1zwsRpZT": "BTC",  // cbBTC
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": "BTC",  // Jupiter Perps BTC market
  "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": "BTC",  // wBTC legacy
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",  // Wormhole wETH
  "2FPyTwcZLUgFDPkudBcsbKDsHpQxNRtKFXJGTpq6BEfp": "ETH",  // allbridge ETH
};

async function getJupiterPerpPositions(address: string): Promise<import("../../lib/types").PerpPosition[]> {
  try {
    // Use perps-api.jup.ag/v2 — the portfolio/v1 endpoint has deserialization issues
    // with newer position account formats. All USD values in v2 are in micro-USD (÷1e6).
    const res = await fetch(`https://perps-api.jup.ag/v2/positions?walletAddress=${address}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const S = 1e6; // micro-USD scale factor
    const positions: import("../../lib/types").PerpPosition[] = [];

    for (const el of data.dataList ?? []) {
      const slReq = (el.tpslRequests ?? []).find((r: Record<string, string>) => r.requestType === "sl");
      positions.push({
        tokenMint: el.assetMint ?? "",
        tokenSymbol: el.asset ?? "?",
        side: el.side === "short" ? "short" : "long",
        leverage: Number(el.leverage ?? 1),
        entryPrice: Number(el.entryPriceUsd ?? 0) / S,
        markPrice: Number(el.markPriceUsd ?? 0) / S,
        liquidationPrice: Number(el.liquidationPriceUsd ?? 0) / S,
        collateralUsd: Number(el.collateralUsd ?? 0) / S,
        sizeUsd: Number(el.sizeUsd ?? 0) / S,
        pnlUsd: Number(el.pnlAfterFeesUsd ?? 0) / S,
        netValueUsd: Number(el.valueUsd ?? 0) / S,
        stopLoss: slReq ? Number(slReq.triggerPriceUsd) / S : null,
      });
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

  // otherUsd is recalculated after DAS prices are available — placeholder here
  const otherUsd = 0;

  return { stableUsd, otherUsd, idleStables, priceMap };
}

const TOKEN_PROGRAM_ID    = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

async function getWalletBalances(address: string): Promise<{ solBalance: number; rawTokens: { mint: string; amount: number; decimals: number }[] }> {
  const rpcCall = (id: string | number, method: string, params: unknown[]) =>
    fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }).then(r => r.json());

  const [balRes, spl1Res, spl2022Res] = await Promise.all([
    rpcCall(1, "getBalance", [address]),
    rpcCall(2, "getTokenAccountsByOwner", [address, { programId: TOKEN_PROGRAM_ID }, { encoding: "jsonParsed" }]),
    rpcCall(3, "getTokenAccountsByOwner", [address, { programId: TOKEN_2022_PROGRAM_ID }, { encoding: "jsonParsed" }]),
  ]);

  const solBalance = (balRes.result?.value ?? 0) / 1e9;

  const parseAccounts = (res: { result?: { value?: unknown[] } }) =>
    (res.result?.value ?? []).map((acc: unknown) => {
      const a = acc as { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } };
      return {
        mint: a.account.data.parsed.info.mint,
        amount: Number(a.account.data.parsed.info.tokenAmount.amount),
        decimals: a.account.data.parsed.info.tokenAmount.decimals,
      };
    }).filter((t) => t.amount > 0);

  const seen = new Set<string>();
  const rawTokens: { mint: string; amount: number; decimals: number }[] = [];
  for (const t of [...parseAccounts(spl1Res), ...parseAccounts(spl2022Res)]) {
    if (!seen.has(t.mint)) { seen.add(t.mint); rawTokens.push(t); }
  }

  return { solBalance, rawTokens };
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "No address provided" }, { status: 400 });

  try {
    const [balances, stakedResult, solPriceData, kaminoPositions, stakedJup, perpPositions] = await Promise.all([
      getWalletBalances(address),
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

    const { solBalance, rawTokens } = balances;
    const kaminoSOL = kaminoPositions.reduce((sum, p) => sum + p.amountSOL, 0);
    const idleSOL = solBalance;

    const mints = rawTokens.map((t: { mint: string }) => t.mint);

    // DAS getAssetBatch (up to 1000 per call) — returns metadata + price_per_token
    async function getAssetBatchMeta(ids: string[]): Promise<Record<string, { name: string; symbol: string; logoURI: string | null; price: number }>> {
      const map: Record<string, { name: string; symbol: string; logoURI: string | null; price: number }> = {};
      if (ids.length === 0) return map;
      const chunkSize = 1000;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
      await Promise.all(chunks.map(async (chunk) => {
        try {
          const res = await fetch(HELIUS_RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAssetBatch", params: { ids: chunk } }),
          });
          const data = await res.json();
          for (const asset of (data.result ?? [])) {
            if (!asset?.id) continue;
            const content = asset.content ?? {};
            const meta = content.metadata ?? {};
            const logoURI =
              content.links?.image ??
              content.files?.[0]?.cdn_uri ??
              content.files?.[0]?.uri ??
              null;
            const price: number = asset.token_info?.price_info?.price_per_token ?? 0;
            map[asset.id] = {
              name: meta.name?.replace(/\0/g, "").trim() || null,
              symbol: meta.symbol?.replace(/\0/g, "").trim() || null,
              logoURI: logoURI ?? null,
              price,
            };
          }
        } catch { /* skip failed chunk */ }
      }));
      return map;
    }

    // Run DAS metadata (includes prices) + Jupiter strict list in parallel
    const [tokenBreakdown, metaMap, jupiterListRaw] = await Promise.all([
      getTokenBreakdown(rawTokens),
      getAssetBatchMeta(mints),
      fetch("https://lite-api.jup.ag/tokens/v1/strict")
        .then((r) => r.json())
        .catch(() => []),
    ]);

    // Build Jupiter fallback map: mint → logoURI
    const jupLogoMap: Record<string, string> = {};
    if (Array.isArray(jupiterListRaw)) {
      for (const t of jupiterListRaw) {
        if (t.address && t.logoURI) jupLogoMap[t.address] = t.logoURI;
      }
    }

    const tokens = rawTokens
      .map((t: { mint: string; amount: number; decimals: number }) => {
        // Prefer DAS price (Helius); fall back to Jupiter price breakdown for stables
        const dasPrice = metaMap[t.mint]?.price ?? 0;
        const stablePrice = tokenBreakdown.priceMap[t.mint] ?? 0;
        const price = dasPrice > 0 ? dasPrice : stablePrice;
        const dasMeta = metaMap[t.mint];
        const logoURI = dasMeta?.logoURI ?? jupLogoMap[t.mint] ?? null;
        return {
          mint: t.mint,
          amount: t.amount,
          decimals: t.decimals,
          name: dasMeta?.name ?? null,
          symbol: dasMeta?.symbol ?? null,
          logoURI,
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
      otherUsd: tokens.reduce((s: number, t: { usdValue: number; mint: string }) =>
        !STABLE_MINTS.has(t.mint) ? s + t.usdValue : s, 0),
      idleStables: tokenBreakdown.idleStables,
      stakedJup,
      perpPositions,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch wallet data" }, { status: 500 });
  }
}
