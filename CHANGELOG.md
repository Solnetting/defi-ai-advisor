# Changelog

All notable changes to DeFi AI Advisor are documented here.

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
