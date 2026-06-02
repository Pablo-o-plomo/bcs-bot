export type MarketStatus = 'open' | 'closed' | 'unknown';
export type TopListMode = 'gainers' | 'losers' | 'volume';
export type ScannerTrend = 'bullish' | 'bearish' | 'neutral';
export type ScannerAction = 'LONG' | 'SHORT' | 'WATCH' | 'SKIP';
export type ScannerRisk = 'low' | 'medium' | 'high';

export interface MarketInstrument {
  ticker: string;
  name: string;
  lastPrice: number | null;
  changePercent: number | null;
  volume: number | null;
  market: string;
  board: string;
  volatility: number | null;
}

export interface MarketSnapshot {
  status: MarketStatus;
  instruments: MarketInstrument[];
  updatedAt: string;
  source: 'MOEX ISS' | 'cached/mock';
  fallback: boolean;
}

export interface ScannerSignal {
  ticker: string;
  changePercent: number | null;
  volume: number | null;
  reasons: string[];
  trend: ScannerTrend;
  action: ScannerAction;
  confidence: number;
  risk: ScannerRisk;
  liquidityScore: number;
  volatility: number | null;
  commissionRub: number;
  momentum: number;
}
