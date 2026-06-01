import type { BcsCashBalance, BcsPosition } from '../broker/bcs/types';
import type { MarketInstrument, MarketSnapshot, ScannerSignal } from '../market/types';
import type { UserSettings } from '../database/models';

export type AiAnalysisKind = 'portfolio' | 'market' | 'risk' | 'deal';

export interface AiPortfolioContext {
  balance: number;
  freeCash: number;
  portfolioValue: number;
  dayPnl: number;
  totalPnl: number;
  cash: BcsCashBalance[];
  positions: BcsPosition[];
  settings: UserSettings;
  source: string;
}

export interface AiMarketContext {
  snapshot: MarketSnapshot;
  signals: ScannerSignal[];
  gainers: MarketInstrument[];
  losers: MarketInstrument[];
  volume: MarketInstrument[];
}

export interface AiRiskContext {
  settings: UserSettings;
  exposureRub: number;
  cashRub: number;
  positionsCount: number;
  paperMode: boolean;
  executionMode: string;
  readOnly: boolean;
  orderExecution: boolean;
}

export interface AiDealContext {
  ticker: string;
  direction: 'long' | 'short';
  instrument?: MarketInstrument;
  settings: UserSettings;
  marketStatus: string;
}
