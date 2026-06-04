import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { messages, context } = await req.json();

  const systemPrompt = `You are a DeFi AI Advisor specialized in Solana portfolios. You are direct, concise, and give actionable advice.

Current wallet context:
${context}

Rules:
- Always refer to the user's actual numbers from the context above
- Give specific recommendations, not generic advice
- Keep answers short and clear
- If asked about yield, reference the live APY data in context
- Never make up numbers not in the context`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: 400,
  });

  return NextResponse.json({ reply: completion.choices[0].message.content });
}
