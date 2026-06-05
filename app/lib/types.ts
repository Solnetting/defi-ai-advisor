export interface KaminoPosition {
  name: string;
  type: string;
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
