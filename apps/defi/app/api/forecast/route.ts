import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { question, currentPrice, currentDate } = await req.json();

  const defaultContribYear = new Date(currentDate).getFullYear() + 3;

  const systemPrompt = `You extract forecast parameters from a user question about a Solana portfolio.
Today is ${currentDate}. Current SOL price is $${currentPrice}.

Classify as "price" or "contribution". Return ONLY valid JSON, no markdown, no explanation.

For PRICE scenarios (e.g. "if SOL hits $500", "price reaches $300 in 2028"):
{"type":"price","targetPrice":<number>,"targetYear":<4-digit year>,"targetMonth":<1-12, default 6>,"label":<max 20 chars, e.g. "SOL @ $500 by 2028">}

For CONTRIBUTION scenarios (e.g. "add 5 SOL/month", "deploy 3 SOL monthly", "stake more SOL each month"):
{"type":"contribution","solPerMonth":<number>,"targetYear":<4-digit year, default ${defaultContribYear}>,"targetMonth":<1-12, default 12>,"label":<max 20 chars, e.g. "+5 SOL/mo till 2029">}

Examples:
- "if SOL is $500 in 2028" → {"type":"price","targetPrice":500,"targetYear":2028,"targetMonth":6,"label":"SOL @ $500 by 2028"}
- "deploy 5 SOL per month till 2029" → {"type":"contribution","solPerMonth":5,"targetYear":2029,"targetMonth":12,"label":"+5 SOL/mo till 2029"}
- "what if I add 3 SOL monthly" → {"type":"contribution","solPerMonth":3,"targetYear":${defaultContribYear},"targetMonth":12,"label":"+3 SOL/mo till ${defaultContribYear}"}`;

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
      label: String(parsed.label ?? (type === "contribution" ? `+${parsed.solPerMonth} SOL/mo` : `SOL @ $${parsed.targetPrice}`)),
    });
  } catch {
    return NextResponse.json({ error: "Could not parse forecast" }, { status: 400 });
  }
}
