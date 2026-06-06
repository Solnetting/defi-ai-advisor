# DeFi AI Advisor

A Solana portfolio advisor that tells you what to do with your crypto — not just what you have.

Most Solana wallets show a balance number and nothing else. Idle SOL earns 0% with no signal that anything is wrong. DeFi positions across Kamino, Jito, and native staking are scattered across five different interfaces with no unified view. There's no single place that shows your full picture, flags the risks, and explains what to do next.

DeFi AI Advisor was built to fix that. It reads your wallet, surfaces what's working and what isn't, scores your risk exposure in real time, and gives you an AI advisor you can actually ask questions to — whether you're new to crypto or actively managing DeFi positions.

---

## Three goals

**1. Massive onboarding — no crypto knowledge required**
Connect a wallet or paste an address. The app detects idle SOL, shows the opportunity cost in plain numbers, and lets you stake natively without leaving — validator already selected, transaction ready. No prior knowledge of staking, validators, or DeFi needed.

**2. One view for DeFi power users**
Staked SOL, Kamino earn vaults, live APY comparison across Jito, Marinade, BlazeStake, and native staking — all in one place. The gap left by Step Finance (shut down February 2026 after a $27M hack). Read-only and non-custodial.

**3. An AI advisor that understands your specific portfolio**
Ask "what should I do with my idle SOL?" or "is Kamino worth the risk?" and get an answer based on your actual wallet data, not generic advice. Powered by Groq (llama-3.3-70b-versatile). Context-aware: the AI knows your balances, staked amounts, Kamino positions, and live APYs before you say a word.

---

## Features

- Wallet connect (Phantom, Solflare) with auto-fetch on connect; wallet state persists across all 3 screens
- SOL balance with staked / idle / Kamino deployed breakdown and live USD value
- Kamino position detail — name, type (earn / lending / liquidity / leverage), and live APY per position with link to Kamino
- Idle SOL and stablecoin detection with opportunity cost framing
- Stablecoin yield tracking — idle stablecoins ranked by best available APY across Kamino, Marginfi, Drift, Save, Lulo, Meteora, and Jupiter Lend (via DeFiLlama); beginner view shows Very Low and Low risk only
- Staking projection chart — 1Y / 3Y / 5Y compounding with plan comparison line; AI scenario overlays (up to 5)
- Live yield comparison engine — Jito, Marinade, Jupiter, BlazeStake, native (via DeFiLlama)
- Native staking modal — validator picker with commission, wiz score, vote success, Jito MEV
- Jupiter swap — SOL ↔ USDC / USDT / JitoSOL with live quote, price impact warning, Solscan confirmation
- **AI plan cards** — proactive recommendations surfaced before the user asks; plan card shows impact metric, badge, projection chart, and CTA in a unified layout
- **AI chat advisor** — unified `ChatPanel` component across all screens; overlay glass panel on Home (floats over chart), inline on Portfolio and Explore; chart-linked responses show a color-matched icon tying the message to its scenario line on the chart
- **AI scenario chart** — ask "what if SOL hits $500?" or "add 2 SOL/month" and a new colored line appears on the chart; up to 5 stacked scenarios; each removable
- **Portfolio Risk Analysis** — composite 0–100 risk score with three weighted components:
  - Protocol Exposure (50%): position type weighted by liquidation/IL risk
  - Concentration (30%): DeFi type spread + stablecoin cushion
  - Derivatives/Leverage (20%): Kamino multiply detection; any leverage floors score at 41
  - Stablecoin detection (USDC, USDT, USDS, PYUSD, USDH, PAI) priced at $1
  - Non-stable tokens priced live via Jupiter Price API; sorted by USD value
  - Overall risk label: Low / Medium / High / Very High; Efficiency score = 100 − risk
- Server-side API key proxy — Helius and Groq keys never exposed to the browser

## Live

**https://defi-six-taupe.vercel.app**

---

## Stack

- Next.js + TypeScript + Tailwind CSS
- Helius API — Solana wallet data and token metadata
- Groq API — AI chat (llama-3.3-70b-versatile)
- DeFiLlama — live APY data
- StakeWiz — validator list for native staking
- Kamino Finance API — DeFi position detection
- Jupiter Price API — live token prices for risk analysis
- CoinGecko — live SOL price

---

## Risk Score System

Composite score 0–100 from three weighted components. Universal model — not tuned per wallet.

### Component 1 — Protocol Exposure (50%)

| Position Type | Weight | Reason |
|---|---|---|
| Leverage / Multiply | 1.0 | Liquidation risk, amplified losses |
| LP / Liquidity | 0.6 | Impermanent loss + smart contract |
| Lending | 0.5 | Liquidation if used as collateral |
| Earn Vault | 0.3 | Audited, single asset, no IL |
| Other tokens | 0.15 | Price volatility |
| Staked SOL | 0.1 | Validator risk only |
| Idle SOL | 0.05 | Price risk, no protocol exposure |
| Stablecoins | 0.02 | Depeg risk only |

### Component 2 — Concentration (30%)

| Condition | Adjustment |
|---|---|
| All DeFi in one protocol type | +40 |
| Two protocol types | +20 |
| Three or more protocol types | +0 |
| Stablecoins > 20% of portfolio | −20 |
| Stablecoins > 40% of portfolio | −35 |

### Component 3 — Derivatives (20%)

| Condition | Score |
|---|---|
| No leverage or perps | 0 |
| Kamino Multiply present | 50 + (leverage% × 50) |
| Drift / Jupiter Perps | Planned — not yet detected |

Any leverage present → score floored at 41 (High minimum).

### Opportunity Readiness (informational + small penalty)

Liquidity is a benefit, not a risk. Liquid capital = ability to act on dips, new yield openings, and emergencies. The metric flips the traditional "locked = risk" framing.

| Liquid % | Score | Label |
|---|---|---|
| 0% | 65 | No dry powder — can't react to opportunities |
| < 5% | 40 | Very limited flexibility |
| 5–10% | 20 | Limited flexibility |
| 10–30% | 0 | Optimal — deployed but ready to act |
| > 30% | 0 | Good flexibility (idle SOL issue addressed elsewhere) |

0% liquid adds +10 to composite score. < 5% adds +5.

### Thresholds

| Score | Label | Typical profile |
|---|---|---|
| 0–20 | Low | Idle SOL, native staking, stablecoin-heavy |
| 21–40 | Medium | Earn vaults, mixed low-risk DeFi |
| 41–65 | High | LP, lending, any leverage present |
| 66–100 | Very High | Dominant leverage or perps |

### Validated scenarios

| Profile | Score | Label |
|---|---|---|
| 100% idle SOL | 2 | Low |
| 100% native staked | 5 | Low |
| 50% staked + 50% earn + stables | 11 | Low |
| 100% Kamino earn vault | 27 | Medium |
| 100% LP / liquidity | 42 | High |
| 50% leverage + 50% earn | 53 | High |
| 100% leverage / multiply | 82 | Very High |

---

## Security

This app is read-only. It never requests wallet signing for data fetching. Your private key never leaves your device. The Helius API key is proxied server-side through `/api/rpc` — it is never exposed in the browser or network requests.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for full feature history.
