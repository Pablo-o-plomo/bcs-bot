export interface BcsApiStatus {
  enabled: boolean;
  connected: boolean;
  accountVerified: boolean;
  readOnly: boolean;
  orderExecutionEnabled: boolean;
  accountId?: string;
  clientId?: string;
  lastError?: string;
  lastCheckedAt?: string;
  lastPingAt?: string;
  lastSyncAt?: string;
}

export interface BcsMoneySummary {
  balance: number;
  freeCash: number;
  portfolioValue: number;
  dayPnl: number;
  totalPnl: number;
  currency: string;
  cash: BcsCashBalance[];
}

export interface BcsCashBalance {
  currency: string;
  available: number;
  blocked: number;
  total: number;
  currentValueRub?: number;
  term?: string;
}

export interface BcsLimits {
  cash: BcsCashBalance[];
  rawDebug: string;
  updatedAt: string;
}

export interface BcsPosition {
  ticker: string;
  name?: string;
  exchange?: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  currentValueRub?: number;
  balanceValueRub?: number;
  dailyPL?: number;
  dailyPercentPL?: number;
  unrealizedPL?: number;
  unrealizedPercentPL?: number;
  unrealizedPnl: number;
  portfolioShare?: number;
  portfolioSharePercent: number;
  instrumentType?: string;
  classCode?: string;
}

export interface BcsPortfolio {
  source: 'BCS API';
  money: BcsMoneySummary;
  positions: BcsPosition[];
  updatedAt: string;
}

export interface BcsTrade {
  externalId: string;
  ticker: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  volume: number;
  commission?: number;
  tradeDateTime: string;
  instrumentType?: string;
  classCode?: string;
}

export interface BcsInstrument {
  ticker: string;
  name?: string;
  classCode?: string;
  instrumentType?: string;
  lotSize?: number;
}

export interface BcsMarketData {
  ticker: string;
  classCode?: string;
  price: number | null;
  lastPrice: number | null;
  volume: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  spreadPercent: number | null;
  volatility: number | null;
  sessionStatus: string;
  source: 'BCS API' | 'MOEX ISS fallback';
  updatedAt: string;
}

export interface BcsCommissionBreakdown {
  grossPnl: number;
  netPnl: number;
  fees: number;
  estimatedSlippage: number;
  details: string[];
}

export interface BcsReadOnlyOrderPayload {
  ticker: string;
  classCode?: string;
  side?: string;
  orderType?: string;
  quantity?: number;
  price?: number;
}
