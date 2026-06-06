import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for Jupiter swap transaction.
// Platform fee (platformFeeBps) lives here so it can never be stripped client-side.
// Fee account setup: https://referral.jup.ag — add your wallet + token accounts there.
const PLATFORM_FEE_BPS = 25; // 0.25% — set to 0 until referral account is created

export async function POST(req: NextRequest) {
  try {
    const { quoteResponse, userPublicKey } = await req.json();

    if (!quoteResponse || !userPublicKey) {
      return NextResponse.json({ error: "Missing quoteResponse or userPublicKey" }, { status: 400 });
    }

    const body: Record<string, unknown> = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    };

    // Uncomment once referral account is set up at referral.jup.ag:
    // body.feeAccount = process.env.JUPITER_FEE_ACCOUNT;
    // body.platformFeeBps = PLATFORM_FEE_BPS;

    const res = await fetch("https://api.jup.ag/swap/v1/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.error) return NextResponse.json({ error: data.error }, { status: 400 });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Swap transaction build failed" }, { status: 500 });
  }
}
