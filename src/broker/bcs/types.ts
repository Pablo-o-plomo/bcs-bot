export interface BcsApiStatus {
  enabled: boolean;
  connected: boolean;
  readOnly: boolean;
  orderExecutionEnabled: boolean;
  accountId?: string;
  clientId?: string;
  lastError?: string;
}

export interface BcsMoneySummary {
  balance: number;
  freeCash: number;
  portfolioValue: number;
  dayPnl: number;
  totalPnl: number;
  currency: string;
}

export interface BcsPosition {
  ticker: string;
  name?: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnl: number;
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
  price: number | null;
  volume: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  spreadPercent: number | null;
  volatility: number | null;
  sessionStatus: string;
}

export interface BcsCommissionBreakdown {
  grossPnl: number;
  netPnl: number;
  fees: number;
  estimatedSlippage: number;
  details: string[];
}
