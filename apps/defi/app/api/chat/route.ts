import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { messages, context } = await req.json();

  const systemPrompt = `You are a DeFi AI Advisor specialized in Solana portfolios. Direct, concise, actionable.

Current wallet context:
${context}

Rules:
- Only use numbers from the context above. Never invent figures.
- When citing a yield or price, mention its source (e.g. "DeFiLlama shows 8.2%").
- When explaining risk, reference the component scores (protocol, concentration, leverage, dry powder).
- Keep answers short — 3–5 lines max unless the user asks for detail.
- If data is unavailable, say so explicitly instead of guessing.
- Never predict prices. Never guarantee returns.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: 400,
  });

  return NextResponse.json({ reply: completion.choices[0].message.content });
}
