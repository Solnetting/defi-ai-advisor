import { NextRequest, NextResponse } from "next/server";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE = "https://api.helius.xyz/v0";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const SOL_MINT = "So11111111111111111111111111111111111111112";

interface KaminoPosition {
  name: string;
  type: string;
  amountSOL: number;
  netValueUsd: number;
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
        positions.push({
          name: pos.vaultName ?? pos.strategyName ?? type,
          type,
          amountSOL,
          netValueUsd,
        });
      }
    }

    return positions;
  } catch {
    return [];
  }
}

async function getSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    const json = await res.json();
    return json.solana?.usd ?? 0;
  } catch {
    return 0;
  }
}

async function getStakedSOL(address: string): Promise<number> {
  const res = await fetch(HELIUS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getProgramAccounts",
      params: [
        "Stake11111111111111111111111111111111111111112",
        {
          encoding: "jsonParsed",
          filters: [{ memcmp: { offset: 44, bytes: address } }],
        },
      ],
    }),
  });
  const json = await res.json();
  const accounts = json.result ?? [];
  let total = 0;
  for (const acc of accounts) {
    const lamports = acc.account?.lamports ?? 0;
    total += lamports;
  }
  return total / 1e9;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "No address provided" }, { status: 400 });

  try {
    const [balancesRes, stakedSOL, solPrice, kaminoPositions] = await Promise.all([
      fetch(`${HELIUS_BASE}/addresses/${address}/balances?api-key=${HELIUS_API_KEY}`),
      getStakedSOL(address),
      getSolPrice(),
      getKaminoPositions(address),
    ]);

    const data = await balancesRes.json();
    const solBalance = (data.nativeBalance ?? 0) / 1e9;
    const kaminoSOL = kaminoPositions.reduce((sum, p) => sum + p.amountSOL, 0);
    const idleSOL = Math.max(0, solBalance - stakedSOL - kaminoSOL);
    const rawTokens = (data.tokens ?? []).filter((t: { amount: number }) => t.amount > 0);

    const mints = rawTokens.map((t: { mint: string }) => t.mint);
    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < mints.length; i += chunkSize) {
      chunks.push(mints.slice(i, i + chunkSize));
    }

    const metaMap: Record<string, { name: string; symbol: string }> = {};
    for (const chunk of chunks) {
      try {
        const metaRes = await fetch(`${HELIUS_BASE}/token-metadata?api-key=${HELIUS_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mintAccounts: chunk, includeOffChain: true, disableCache: false }),
        });
        const metaData = await metaRes.json();
        if (Array.isArray(metaData)) {
          for (const item of metaData) {
            const mint = item.account;
            const name =
              item.onChainMetadata?.metadata?.data?.name?.replace(/\0/g, "").trim() || null;
            const symbol =
              item.onChainMetadata?.metadata?.data?.symbol?.replace(/\0/g, "").trim() || null;
            if (mint) metaMap[mint] = { name, symbol };
          }
        }
      } catch {
        // skip failed chunk
      }
    }

    const tokens = rawTokens.map((t: { mint: string; amount: number; decimals: number }) => ({
      mint: t.mint,
      amount: t.amount,
      decimals: t.decimals,
      name: metaMap[t.mint]?.name ?? null,
      symbol: metaMap[t.mint]?.symbol ?? null,
    }));

    return NextResponse.json({ solBalance, stakedSOL, kaminoSOL, idleSOL, solPrice, kaminoPositions, tokens });
  } catch {
    return NextResponse.json({ error: "Failed to fetch wallet data" }, { status: 500 });
  }
}
