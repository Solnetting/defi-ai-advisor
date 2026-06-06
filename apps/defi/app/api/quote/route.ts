import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const inputMint = searchParams.get("inputMint");
  const outputMint = searchParams.get("outputMint");
  const amount = searchParams.get("amount");
  const slippageBps = searchParams.get("slippageBps") ?? "50";

  if (!inputMint || !outputMint || !amount) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  try {
    const url =
      `https://api.jup.ag/swap/v1/quote` +
      `?inputMint=${inputMint}` +
      `&outputMint=${outputMint}` +
      `&amount=${amount}` +
      `&slippageBps=${slippageBps}`;

    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = await res.json();

    if (data.error) return NextResponse.json({ error: data.error }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Quote fetch failed" }, { status: 500 });
  }
}
