# Changelog

All notable changes to DeFi AI Advisor are documented here.

---

## [2026-06-08] — Session 6: Explore page validator picker, AI picks, safety labels, stake detection fix

### Explore page — SOL staking tab with validator picker
- Integrated `NativeStakeModal` directly into Explore page (SOL staking tab)
- Validator list with full AI pick: surfaced best validator by risk-adjusted APY using safety multipliers
- "AI Pick" banner with purple card, expandable criteria panel ("Why this one?")
- Safety labels replace raw risk text: "Very Low" → "Safe", "Medium" → "Moderate", "High" → "High risk"
- Safety dot system: colored circle instead of text color for risk indicator

### StableYieldModal — AI pick
- Added `pickBest()` scoring function: APY × safety multiplier (1.0 for Very Low, 0.5 for High)
- Purple "AI Pick" card appears above option list for the top safe option
- Expandable criteria ("Why this one?") explains the scoring logic to the user

### Explore page — color fix
- Yearly SOL earning potential: `text-yellow-600` → `text-green-600` (was reading as a warning, now positive)

### Wallet API — stake detection rewrite
- Replaced transaction-history crawl (3 pages × 100 txs + multiple batches) with direct `getProgramAccounts` using `memcmp` filters
- Two parallel queries: staker authority (offset 12) + withdrawer authority (offset 44) — deduped by pubkey
- JUP staking detection added: tracks staked JUP + unstaking window amounts via `StakedJup` type
- Result: faster, more reliable, fewer Helius API calls

### AI chat prompt — scenario vs prediction
- Clarified: AI must calculate hypothetical scenarios ("what if SOL hits $500") but not predict prices
- If user asks about a token they don't hold, decline with "You don't hold X" — not a blanket policy refusal

### Forecast API — sell scenarios + non-SOL guard
- Sell scenarios now classified: "sell half my SOL in 3 months" → negative `solPerMonth` contribution
- Non-SOL questions (JUP, BTC, general) return `{type: null}` — no chart update, text reply only
- `currentSOL` passed from client so "half" calculations are accurate

### Bug fixes
- `lightningcss-darwin-arm64` native binary added to `package.json` optionalDependencies

---

## Typography + Portfolio layout (2026-06-08)

### Font: Space Mono → Geist Sans
- Switched global typeface from Space Mono (monospace/terminal) to Geist Sans (Vercel's grotesque)
- Decision: fintech 2026 polish direction; Carlos compared and kept Geist

### Portfolio screen — Capital at work inline
- Removed standalone "Capital at work" card
- Deployment bar (green = earning, amber = idle) now lives directly below the total value, no capsule
- Breakdown labels (Staked · DeFi · JUP · Stables · Idle SOL %) flow inline under the bar
- Section order: total value → deployment bar → Risk Analysis → Assets

### Plans tab rename
- Bottom nav "Home" → "Plans"

---

## Micro-interactions — Loading & Success States (2026-06-08)

### Skeleton loading screens
- Home page: shimmer skeleton mirrors hero value + plan card layout while wallet data fetches (2–5s)
- Portfolio page: shimmer skeleton mirrors value card + risk card + assets list
- Both show "✦ AI Analyzing…" label so the wait feels intentional, not broken

### AI typing dots
- ChatPanel and FreeformChip: replaced "Thinking…" text with 3 purple bouncing dots (staggered animation, 1.2s loop)

### Staking success animation (Revolut-style)
- NativeStakeModal success state: animated SVG circle draws in (0.55s) then checkmark draws in (0.35s)
- Full panel scales in with spring easing
- Clean layout: icon → "Staked successfully" → validator name → Solscan link → Done button

---

## Business Ideas & Revenue Model

### Swap fees (Jupiter) — DECISION PENDING
- Code is ready in `/api/swap/route.ts` — `platformFeeBps: 25` and `feeAccount` written but commented out
- Commented out because: Jupiter requires a valid referral account first — sending `platformFeeBps` without it causes the swap tx to fail
- **Setup required before enabling:**
  1. Go to referral.jup.ag with your wallet
  2. Create referral account (~0.1 SOL one-time)
  3. Create fee token accounts for each output token: SOL, USDC, USDT, JitoSOL
  4. Add wallet address to `.env.local` as `JUPITER_FEE_ACCOUNT`
  5. Uncomment 2 lines in `/api/swap/route.ts`
- **Fee rate options considered:**
  - 0.85% — Phantom/Birdeye standard, feels extractive for an advisor product
  - 0.25% — current proposal, market-reasonable ($2.50 on $1,000 swap)
  - 0.1% — defensible as infrastructure cost, lowest friction
  - 0% — pure advisor positioning, no conflict of interest, monetize via staking rev-share instead
- **Strategic tension:** charging swap fees on top of a recommendation creates a conflict of interest. If the primary monetization is validator rev-share (staking), drop swap fee to 0 or 0.1% and lean into "trusted advisor" positioning
- Realistic at scale: $2,500–$5,000/month per $1M swap volume at 0.25%

### Validator white-labeling (staking) — preferred primary revenue
- Negotiate a rev-share with a validator (e.g., Jito, Marinade, or an independent validator)
- Take a % of staking rewards from users who stake through the app's recommended validator
- Scales with TVL not transaction count — more durable than swap fees
- No conflict of interest: the recommendation IS the product
- How Marinade, Jito, BlazeStake actually make money

### Fiat on-ramp referrals (buy funnel)
- MoonPay, Transak, Coinbase Pay all have referral/partner programs
- User buys SOL via the app → referral fee on the purchase
- Requires separate partnership application with each provider
- Positions app as a full DeFi entry point, not just a portfolio viewer

### Buy funnel concept
- AI already knows the portfolio gap ("stake 2 more SOL → earn $130/yr")
- Add [Buy SOL] → MoonPay/Transak and [Swap to SOL] → Jupiter Terminal buttons to plan card
- Closes the loop: AI recommends → user acts → app earns → wallet updates

### Security note (pre-public checklist)
- `/api/rpc` is an open proxy — whitelist allowed RPC methods before launch
- Add rate limiting to `/api/chat` and `/api/rpc` (Vercel edge or simple counter)
- Validate wallet address as valid Solana pubkey before passing to Helius
- User fund risk: near zero (all movements require wallet signature in Phantom)
- API cost abuse risk: HIGH without rate limiting

---

## [2026-06-06] — Session 5: Chat input redesign + sell scenarios + DS hard stops + layout fixes

### Unified wallet entry (unconnected state)
- Removed separate "Connect Wallet" button + address input as two independent entry points
- Single pill input: placeholder "Paste any Solana address…" with nested pill button
- Button switches: "Connect" (empty input → opens wallet modal) / "Go" (typing → analyze address)
- Top bar hides Swap + WalletButton when not connected — one entry point only

### Chat input redesign (DS-compliant)
- Outer: purple-bordered pill (`border-purple-700/40`, brightens on focus)
- ✦ icon: `text-purple-700` resting / `text-purple-400` focused (AI surface, per DS rules)
- "Ask" button: nested inside right end of pill, `bg-purple-700` (NOT white — white = primary CTA only, this rule now in hard_stops.md)
- Always visible regardless of focus state — no conditional show/hide

### Scenario pill redesign
- Removed `→ $price` from each pill (price shown in chat log)
- Pills now compact: `{icon} {label} ✕` only
- `flex-row flex-wrap` layout — stack horizontally, wrap to next row if needed

### Sell scenarios in AI chart
- `/api/forecast` now classifies sell questions as negative contribution (`solPerMonth < 0`)
- `currentSOL` passed from chat handler so LLM can calculate "half" correctly
- Chart formula already handles negative contributions naturally (line goes down then flattens)
- Reply text: "Selling ~X SOL over N months → Y SOL remaining · $Z"
- Sell label example: "sell half in 3mo"

### Chart tooltip color dots
- Replaced `formatter`-based tooltip with custom `content` renderer
- Each tooltip row: colored circle + label + value
- Yellow (#fbbf24) = Current path, Green (#4ade80) = With plan, scenario colors for forecasts
- Both lines always shown regardless of value equality (hard rule, locked in memory)

### Layout — chat chip overflow fix
- Removed `overflow-hidden` from `<main>` — the chip was being clipped at the bottom
- Scrollable div has its own `overflow-y-auto` — main doesn't need to clip it

### Design system hard stops (saved to memory)
- Chart: never change without Carlos's approval
- Tooltip: never suppress any entry regardless of value
- White = one primary CTA only ("Review plan →"), never a second white button
- Purple = AI surfaces only (✦, chat border, Ask button)
- Vercel: local-only unless Carlos explicitly says deploy

### Bug fixes
- `lightningcss-darwin-arm64` native binary missing after `vercel build` polluted workspace; fixed by reinstalling from repo root + clearing .next cache
- `@tailwindcss/postcss` missing (same root cause); reinstalled via workspace root npm install

---

## [2026-06-06] — Session 4: Plan card redesign + ChatPanel component + design system

### Plan card — full layout redesign
- New hierarchy inside the unified card: PLAN label → title → hero impact number → impact badge → detail text → legend+timeframe → chart → CTA button
- "PLAN X OF Y" label: yellow (`text-yellow-500`), uppercase, bold — matches yellow chart line color
- Plan title: `text-base font-semibold` (was `text-2xl`)
- Hero impact number: `text-3xl font-bold text-green-400` (was `text-5xl`)
- Impact badge: smaller outlined pill (`text-[9px]`, tighter padding), border + text color-coded by impact level
- Timeframe buttons (1Y / 3Y / 5Y): removed capsule background — now just `text-white` (active) vs `text-gray-600` (muted), no `bg-gray-800` pill
- "Review plan →" CTA moved to bottom of card below chart; full-width white rounded pill
- Chart height increased to 180px

### ChatPanel — unified component (replaces FreeformChip)
- Created `app/components/ChatPanel.tsx` as single AI chat component across all 3 screens
- Two modes: `mode="overlay"` (Home — absolute glass panel floats over content) and `mode="inline"` (Portfolio + Explore — in-flow at bottom)
- Glass effect: `backdrop-blur-xl` + `rgba(8,6,18,0.85)` background — works because scrollable content shows behind the panel
- Border: `border-gray-800` (matches plan card contrast)
- Thread uses explicit `maxHeight: 220` with `overflow-y-auto` — fixes overlap with input field
- `FreeformChip.tsx` replaced on all pages; dead code (file kept but unused)
- Home: `sendUnified` refactored into `handleChatSend(input, messages) => Promise<ChatMessage>` — cleaner interface, no page-level chat state
- Removed: `chatMessages`, `chatInput`, `chatLoading`, `chatPanelOpen`, `chipFocused`, `threadRef` from `page.tsx`

### AI chart icon — color rules finalized
- Icon only shown when `m.color` is defined (message triggered a chart scenario line)
- Icon color always matches the scenario line exactly (blue, pink, teal, etc.)
- General AI answers: no icon — clean text only
- Rule: the icon's only purpose is visual linkage between chat message and chart line; without a line it's noise

### Design system — color rules (added to memory/rules.md)
- Purple (`#a855f7` / `text-purple-400`) is reserved exclusively for AI surfaces: chat panel header, chip border focus, scenario line color 1
- "PLAN X OF Y" label: yellow (not purple) — matches the yellow current-path chart line, not AI
- Impact badge, section headers, navigation: never purple

### Bug fix — build error
- Stale outer IIFE wrapper left after plan card refactor caused Turbopack parse error at line 477
- Fixed by removing redundant `{(() => { return (` wrapper; inner IIFE retained
- Stale `setChatInput` call removed (state was deleted with ChatPanel migration)

### Vercel deployment (session 4)
- Deployed: `https://defi-six-taupe.vercel.app` (stable alias)

---

## [2026-06-06] — Session 3: Chat UX + token sorting + deployment

### Chat panel — overlay redesign (Home)
- Removed inline thread from scrollable content area; thread is now a separate panel that slides up above the chip
- Panel has header: "✦ AI" label + Clear button + × close button
- Close collapses the panel but preserves message history; "Show ↑" appears on chip to reopen
- `chatPanelOpen` state added; panel auto-opens when a message is sent (`setChatPanelOpen(true)` in `sendUnified`)

### AI chat icon — color-coded to chart line
- Each AI message in the chat panel now shows a small outlined circle with a sparkline SVG inline at the end of the message text (14px, no separate avatar row)
- Icon color matches the scenario line color when the response triggered a chart scenario (blue, pink, teal, etc.)
- General answers (no chart line) use purple fallback
- `chatMessages` type extended: `{ role, content, color?: string }` — `color` set to `newScenario.color` when a scenario is created
- Same icon pattern applied to `FreeformChip.tsx` (Portfolio + Explore pages)

### Chat closeable — FreeformChip (Portfolio + Explore)
- `open` state added to `FreeformChip`; defaults to `true`
- × button appears on the right of the chip input when not focused → closes the whole widget
- Collapsed state shows a minimal "✦ Ask AI" text button above the nav bar to reopen
- Ask button (send) and × are mutually exclusive: × only shows when input is not focused

### Token list — sorted by USD value
- `getTokenBreakdown` in `app/api/wallet/route.ts` now returns `priceMap: Record<string, number>` (stables = 1, others from Jupiter price API)
- Each token gets `usdValue` computed from `priceMap[mint] * (amount / 10^decimals)`
- Tokens sorted by `usdValue` descending before returning from GET handler
- `Token` interface in `lib/types.ts` extended with `usdValue: number`
- Portfolio page token list now shows USD value (primary) + raw amount (secondary, smaller)

### Chart default timeframe
- Changed from 3Y to 1Y (`useState("1Y")` in `page.tsx`)

### Vercel deployment
- First production deploy: `https://defi-six-taupe.vercel.app`
- Fixed: removed unused `@defi/ui: "*"` workspace dependency from `package.json` (caused npm E404 during build)
- Env vars added via CLI: `HELIUS_API_KEY`, `GROQ_API_KEY`
- Decision: continue working locally only going forward

---

## [2026-06-06] — Session 2: Swap + AI trust layer

### Jupiter Swap integration
- `app/components/SwapModal.tsx` — bottom sheet modal: SOL / USDC / USDT / JitoSOL pairs, debounced quote fetch, flip (↕), price impact warning (yellow >0.3%, red >1%), success screen with Solscan link
- `app/api/swap/route.ts` — server-side proxy for Jupiter swap tx; `platformFeeBps` infrastructure written and commented out pending referral account setup
- `app/api/quote/route.ts` — proxy route created then bypassed: Jupiter `api.jup.ag` sets `access-control-allow-origin: *`, so quote is fetched directly from the browser for speed; proxy kept for fallback
- Quote API migrated: `quote-api.jup.ag/v6` is dead → `api.jup.ag/swap/v1` (quote + swap both updated)
- Swap trigger: "Swap" button added to home page header bar, left of WalletButton
- Platform fee decision pending — see Business Ideas section

### AI trust layer (evidence + explainability)
- Chat context string (`page.tsx` → `sendUnified`) now includes:
  - Source label on every data point: `· source: Helius`, `· source: Kamino API`, `· source: DeFiLlama`, `· source: CoinGecko`
  - Fetch timestamp on every section (`fetched 14:32`)
  - SOL 24h price change included
  - Kamino positions now show APY per position
  - Full risk score breakdown sent to AI: protocol score, concentration score, derivatives/leverage score, dry powder %
- System prompt (`/api/chat/route.ts`) updated: AI must cite sources, reference component scores when explaining risk, say "unavailable" instead of guessing, hard guardrails against price prediction and guaranteed returns
- Frontend source attribution (visible to users):
  - `· CoinGecko` label next to 24h portfolio change
  - `DeFiLlama · CoinGecko · Helius · Kamino` footnote at bottom-right of chart card
  - `· DeFiLlama` appended to stable yield plan detail line

### AI architecture audit (framework applied)
- Confirmed already done: live data layer, facts separated from AI, basic guardrails, structured output (forecast route)
- Gaps closed this session: evidence/source attribution, risk breakdown in AI context
- Gaps deferred: RAG knowledge base (skip until protocol docs exist), evaluation suite (after output format stabilises), fine-tuning (not needed at this scale)
- Decision: primary bottleneck is trust layer, not model capability — Groq/llama-3.3-70b is sufficient

---

## [2026-06-06] — Design System session 1

### Monorepo architecture
- Converted project to Turborepo workspace — `apps/defi` (Next.js app) + `packages/ui` (DS)
- Root `package.json` with npm workspaces, `turbo.json` pipeline for `dev` / `build` / `storybook`
- `.env.local` copied to `apps/defi/` — API keys restored after migration
- Storybook installed in `packages/ui` (v10, Vite builder, Vitest + a11y + docs addons)
- App runs on `localhost:3000`, Storybook on `localhost:6006`

### Visual language decisions
- **Mood**: Clean Fintech — data-dense but approachable, not crypto-intimidating
- **Type**: Inter (UI text) + Space Mono (numbers/values only — APY, SOL, portfolio value)
- **Accent**: Purple reserved exclusively for AI surfaces (chip, forecast lines, AI replies)
- **Buttons**: Rounded (pill-shaped) confirmed

### Typography
- Font switched from Arial fallback → Space Mono via `geist` npm package + `next/font/local`
- `globals.css` body font-family wired to `--font-sans` CSS variable
- Portfolio value bumped from `text-3xl` to `text-5xl tracking-tight`

### Figma DS — Variable collections
- **Primitives** (68 COLOR variables): neutral/0–1000, purple/50–950, green/50–950, yellow/50–950, red/50–950, blue/50–950
- **Tokens** (35 COLOR variables, all aliased to Primitives): bg/, text/, border/, accent/, positive/, warning/, negative/, info/, interactive/
- **Typography** (27 variables): family/, size/12–48, line-height/16–52, weight/, tracking/ — all on 4px grid
- **Spacing** (14 FLOAT variables): space/0 → space/52 on 4px grid
- Typography semantic tokens added to Tokens collection: type/micro through type/display-lg (size + line-height pairs)
- 9 Figma Text Styles created: Micro · Caption · Body · Subtitle · Title · Heading · Display S/M/L
- Display M + L use Space Mono Bold; all others Inter

### Figma DS — Components (DS page)
- **Button** component set: 27 variants (Primary / Ghost / Danger × SM / MD / LG × Default / Disabled / Loading). Pill-shaped corners. Note: icon position to be updated — icon right for directional CTAs, icon left for status only.
- **Badge** component set: 6 variants (Positive · Warning · Negative · Accent · Info · Neutral). Uppercase label, 1px tracking, semantic bg/text/border per variant.

### Stable yields fix
- DeFiLlama fetch changed from `{ next: { revalidate: 300 } }` to `{ cache: "no-store" }` to bust stale cache that was hiding Kamino pools

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
