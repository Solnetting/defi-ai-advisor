export interface KaminoPosition {
  name: string;
  type: string;
  tokenSymbol: string | null;
  amountSOL: number;
  netValueUsd: number;
  apy: number | null;
}

export interface IdleStable {
  symbol: string;
  mint: string;
  usd: number;
}

export interface Token {
  mint: string;
  amount: number;
  decimals: number;
  name: string | null;
  symbol: string | null;
  logoURI: string | null;
  usdValue: number;
}

export interface PerpPosition {
  tokenMint: string;        // e.g. So111... = SOL
  tokenSymbol: string;      // "SOL", "BTC", "ETH"
  side: "long" | "short";
  leverage: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  collateralUsd: number;
  sizeUsd: number;
  pnlUsd: number;           // unrealized PnL
  netValueUsd: number;      // collateral ± pnl
  stopLoss: number | null;
}

export interface StakedJup {
  amount: number;          // JUP tokens staked (human-readable)
  usd: number;             // USD value at current price
  unstakingAmount: number; // JUP currently in 7-day unstaking window
  jupPrice: number;
}

export interface WalletData {
  solBalance: number;
  stakedSOL: number;
  stakeStatus: string;
  kaminoSOL: number;
  idleSOL: number;
  solPrice: number;
  solPrice24hChange: number;
  epochHoursRemaining: number;
  kaminoPositions: KaminoPosition[];
  tokens: Token[];
  stableUsd: number;
  otherUsd: number;
  idleStables: IdleStable[];
  stakedJup: StakedJup;
  perpPositions: PerpPosition[];
  error?: string;
}

export interface YieldOption {
  label: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: string;
  liquidity: string;
  url: string;
}

export interface StableYield {
  protocol: string;
  apy: number;
  risk: string;
  url: string;
  tvlUsd: number;
}
