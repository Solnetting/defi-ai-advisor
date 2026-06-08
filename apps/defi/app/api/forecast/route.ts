import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { question, currentPrice, currentDate, currentSOL } = await req.json();

  const defaultContribYear = new Date(currentDate).getFullYear() + 3;

  const systemPrompt = `You extract forecast parameters from a user question about a Solana portfolio.
Today is ${currentDate}. Current SOL price is $${currentPrice}. User currently holds ${currentSOL ?? "unknown"} SOL.

IMPORTANT: Only classify SOL-specific scenarios. If the question is about any other token (JUP, BTC, ETH, USDC, etc.) or is a general question, return {"type":null}.

Classify as "price", "contribution", or null. Return ONLY valid JSON, no markdown, no explanation.

For SOL PRICE scenarios (e.g. "if SOL hits $500", "SOL reaches $300 in 2028"):
{"type":"price","targetPrice":<number>,"targetYear":<4-digit year>,"targetMonth":<1-12, default 6>,"label":<max 20 chars, e.g. "SOL @ $500">}

For SOL CONTRIBUTION scenarios — adding SOL (e.g. "add 5 SOL/month", "stake more SOL each month"):
{"type":"contribution","solPerMonth":<positive number>,"targetYear":<4-digit year, default ${defaultContribYear}>,"targetMonth":<1-12, default 12>,"label":<max 20 chars, e.g. "+5 SOL/mo">}

For SOL SELL scenarios — reducing SOL (e.g. "sell half my SOL in 3 months", "liquidate 10 SOL", "sell some SOL"):
{"type":"contribution","solPerMonth":<negative number: -(amount to sell) / months>,"targetYear":<year>,"targetMonth":<month>,"label":<max 20 chars, e.g. "sell half in 3mo">}
For "sell half": solPerMonth = -(${currentSOL ?? 0} / 2) / targetMonths (rounded to 2 decimals).
For "sell X SOL": solPerMonth = -X / targetMonths.

For NON-SOL questions (any other token or general questions):
{"type":null}

Examples:
- "if SOL is $500 in 2028" → {"type":"price","targetPrice":500,"targetYear":2028,"targetMonth":6,"label":"SOL @ $500"}
- "deploy 5 SOL per month till 2029" → {"type":"contribution","solPerMonth":5,"targetYear":2029,"targetMonth":12,"label":"+5 SOL/mo"}
- "sell half my SOL in 3 months" → {"type":"contribution","solPerMonth":<-(currentSOL/2)/3>,"targetYear":<current year>,"targetMonth":<current month + 3>,"label":"sell half in 3mo"}
- "sell 10 SOL over 6 months" → {"type":"contribution","solPerMonth":-1.67,"targetYear":<year>,"targetMonth":<month>,"label":"sell 10 SOL in 6mo"}
- "what if JUP hits $1" → {"type":null}
- "what if BTC reaches $200k" → {"type":null}
- "how does Jito compare to native staking" → {"type":null}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      max_tokens: 150,
      temperature: 0,
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.type) return NextResponse.json({ type: null });

    const now = new Date(currentDate);
    const target = new Date(parsed.targetYear, (parsed.targetMonth ?? 12) - 1, 1);
    const targetMonths = Math.max(
      1,
      (target.getFullYear() - now.getFullYear()) * 12 +
        (target.getMonth() - now.getMonth())
    );

    const type = parsed.type === "contribution" ? "contribution" : "price";

    return NextResponse.json({
      type,
      ...(type === "contribution"
        ? { solPerMonth: Number(parsed.solPerMonth) }
        : { targetPrice: Number(parsed.targetPrice) }),
      targetMonths,
      label: String(parsed.label ?? (type === "contribution" ? `${parsed.solPerMonth > 0 ? "+" : ""}${parsed.solPerMonth} SOL/mo` : `SOL @ $${parsed.targetPrice}`)),
    });
  } catch {
    return NextResponse.json({ error: "Could not parse forecast" }, { status: 400 });
  }
}
