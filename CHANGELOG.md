# Changelog

All notable changes to DeFi AI Advisor are documented here.

---

## [2026-06-05] — session 3 (continued)

### Bug fixes
- **Stable yields returning empty**: `/api/stable-yields` always returned the full `{ USDC: [...], USDT: [...] }` map — Explore page was calling it with `?symbol=USDC` (ignored) and checking `Array.isArray()` on an object (always false). Fixed: fetch the map once, set directly, no per-symbol calls.
- **"Projection for this plan" overlapping chart**: `-mb-1` negative margin was collapsing the gap into the chart section. Removed.

---

## [2026-06-05] — session 3

### Navigation architecture — 3-tab bottom nav
- **Bottom nav** (`app/components/BottomNav.tsx`): Home / Portfolio / Explore tabs, active state highlighted, SVG icons, `usePathname` for active detection
- **Portfolio page** (`/portfolio`): total value breakdown (SOL/DeFi/Stables), full risk analysis with spectrum bar + 4 component scores, all positions (staked, idle, Kamino, stables, tokens), auto-fetches from localStorage address or connected wallet
- **Explore page** (`/explore`): live SOL staking yields ranked by APY, stablecoin yields per idle stable token (tab appears only if user holds stables), personalized idle balance callout + projected yearly return per option
- **Shared types** (`app/lib/types.ts`): WalletData, KaminoPosition, IdleStable, Token, YieldOption, StableYield — removes type duplication across pages
- **Address persistence**: `analyze()` now writes `lastAddress` to localStorage so Portfolio and Explore auto-load the same wallet without re-entry
- Home page: BottomNav added as final `shrink-0` element (chip stays above it)

---

## [2026-06-05] — session 2

### Decimal precision + chip refinements
- `fmtUSD` / `fmtSOL` applied to plan impact cards — small yields (e.g. 0.05 SOL idle) no longer show "$0/yr"
- Stable yield plan: removed `Math.round`, threshold lowered from `yr < 1` to `yr < 0.01`
- Chip: dormant by default (purple border at 50% opacity, muted text), activates only on focus
- Chip no longer auto-activates on wallet load — pre-loads question text but stays dormant
- Portfolio detail section removed
- Light mode experiment (V17b mockup) attempted and reverted — dark theme restored
- AI card split from chart into standalone `bg-black rounded-2xl` block; "Projection for this plan" label added between card and chart section

---

## [2026-06-05] — session 1

### Unified AI input + fixed bottom bar (V17a)
- Replaced separate forecast chip + collapsible chat with a single input bar pinned at the bottom of the viewport
- Layout is now `h-dvh flex flex-col` — keyboard-aware on mobile, content scrolls above, input stays fixed
- `sendUnified()` routes questions: tries `/api/forecast` first (chart scenario), falls back to `/api/chat` (general)
- Chart scenarios add a projection line AND a thread reply ("Chart updated above.")
- General questions appear as text-only in the thread — no line drawn
- Unified reply thread lives inside the AI panel, below the chart, auto-scrolls to newest message
- Removed: `chipActive`, `chipQuery`, `chatOpen`, `forecastQuery`, `forecastLoading` states

---

## [2026-06-04]

### Portfolio Risk Analysis
- Composite risk score (0–100) from three weighted components + opportunity penalty
- Component 1 — Protocol Exposure (50%): dollar-weighted by position type (Multiply 1.0 · LP 0.6 · Lending 0.5 · Earn 0.3 · Staked 0.1 · Idle 0.05 · Stables 0.02 · Other 0.15)
- Component 2 — Concentration (30%): protocol/strategy spread — penalises single-type DeFi, rewards stablecoin cushion (>20% stables: −20, >40%: −35)
- Component 3 — Derivatives (20%): Kamino multiply as leverage proxy; Drift/Jupiter Perps flagged as not yet detected
- Opportunity Readiness replaces Liquidity Risk — liquidity is a benefit, not a problem. 0% liquid = +10 penalty (can't act on dips or new yields). 10–30% liquid = optimal range. Score 0 = fully flexible.
- Any derivatives/leverage floors score at 41 (High minimum)
- Thresholds: 0–20 Low · 21–40 Medium · 41–65 High · 66–100 Very High
- "Why?" panel shows four metrics: Protocol / Concentration / Derivatives / Opportunity Readiness — each with score, color, and plain-language context
- Gradient spectrum bar (green→red) with marker dot at score position
- AI Recommendation CTA fires pre-built prompt returning 3 bullet action items (no paragraphs)

### Kamino Position Detail
- Each Kamino position now shows name, type (earn / lending / liquidity / multiply), and live APY
- APY extracted from Kamino portfolio API response — displayed per position in the Deployed card
- Deployed card shows full position breakdown instead of a single "In Kamino" label

---

## [2026-06-03] — Initial Build

### Wallet Analysis
- Wallet address input with manual analyze trigger
- SOL balance fetch via Helius API
- Token list with on-chain metadata resolution (name, symbol)
- Show/hide token list with "Show all" CTA

### Portfolio Breakdown
- Live SOL price via CoinGecko — all balances shown in SOL and USD
- Staked SOL detection via Solana stake program accounts
- Idle SOL detection — SOL not staked and not deployed
- Kamino DeFi position detection (earn, lending, liquidity, multiply)
- Kamino-deployed SOL excluded from idle calculation
- 3-column layout: Staked / Idle / Deployed side by side

### Staking Projection
- Compound growth chart over 1Y / 3Y / 5Y
- Idle SOL projected at 6.8% average APY
- Kamino position projected at 5.5% APY shown as separate line
- USD value projection alongside SOL
- Opportunity cost framing: exact yield missed per year

### Yield Comparison Engine
- Live APY data from DeFiLlama for Jito, Marinade, Jupiter, Drift, BlazeStake
- Native staking included at estimated 6.5% APY
- Risk level and liquidity type per protocol
- TVL displayed for credibility signal
- Best APY highlighted
- Direct ↗ Stake links to each protocol (purple CTA)
- SOL/yr yield shown based on user's actual idle balance

### Native Staking Modal
- Validator list fetched from StakeWiz API (top 50 by Wiz score)
- Filters: non-delinquent, commission ≤ 10%, score > 50
- Search bar to filter validators by name
- Commission, Wiz score, vote success rate, Jito MEV flag per validator
- Amount input with Max button
- Transaction built with @solana/web3.js StakeProgram
- Phantom/Solflare approval popup triggered in-app
- Post-confirmation Solscan link

### Wallet Connection
- Phantom and Solflare wallet adapter integration
- Auto-fetch on wallet connect — no manual address input needed
- Manual address input kept as fallback for unconnected users
- Connected wallet shown in header (truncated address)

### AI Chat Advisor
- Groq-powered chat (llama-3.3-70b-versatile)
- Fully context-aware: SOL balance, staked, idle, Kamino positions, live APYs
- Collapsible inline panel below portfolio cards
- Suggested prompts shown on first open

### Security
- All API keys server-side only (never exposed to browser)
- Helius RPC proxied through /api/rpc — key never visible in network tab
- Read-only wallet connection — no signing, no fund access
- .env.local gitignored
