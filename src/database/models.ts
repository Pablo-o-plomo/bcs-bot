export type Direction = 'LONG' | 'SHORT';
export type InstrumentType = 'stock' | 'future' | 'currency' | 'bond' | 'fund' | 'option';
export type TradeStatus = 'draft' | 'open' | 'closed' | 'cancelled';

export interface User {
  id: number;
  telegramId: string;
  createdAt: string;
}

export interface UserSettings {
  id: number;
  userId: number;
  depositRub: number;
  riskPerTrade: number;
  maxDailyLoss: number;
  maxOpenPositions: number;
}

export interface Instrument {
  id: number;
  ticker: string;
  name: string;
  type: InstrumentType;
  market: string;
}

export interface BrokerFee {
  id: number;
  userId: number;
  tariffName: string;
  stockFeePercent: number;
  currencyFeePercent: number;
  futuresFeePerContract: number;
  extraCurrencyBuyFeePercent: number;
}

export interface TradeInput {
  userId: number;
  ticker: string;
  instrumentType: InstrumentType;
  direction: Direction;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  commission: number;
  status?: TradeStatus;
  pnl?: number;
  comment?: string;
  rr?: number;
}

export interface Trade extends TradeInput {
  id: number;
  exitPrice?: number;
  createdAt: string;
  closedAt?: string;
}

export interface Position {
  id: number;
  userId: number;
  ticker: string;
  direction: Direction;
  avgEntryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice?: number;
  unrealizedPnl: number;
  createdAt: string;
}

export interface AiReview {
  id?: number;
  tradeId?: number;
  reviewText: string;
  score: number;
  createdAt?: string;
}

// Compatibility aliases for older report helpers still kept in the project.
export type BcsTradeInput = {
  telegramId: string;
  symbol: string;
  instrumentType: InstrumentType;
  direction: Direction;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  commissionRub?: number;
  comment?: string;
};

export interface RiskCalculation {
  positionAmountRub: number;
  riskRub: number;
  riskPercentOfDeposit: number;
  potentialProfitRub: number;
  riskReward: number;
  commissionRub: number;
  pnlAtTakeProfitRub: number;
  pnlAtStopRub: number;
}

export type ErrorTag = 'bad_risk_reward' | 'overtrading' | 'stop_too_tight' | 'stop_too_wide' | 'correct_execution';

export interface AnalysisReport {
  id?: number;
  periodStart: string;
  periodEnd: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  bestSetups: string[];
  worstSetups: string[];
  frequentErrors: string[];
  recommendations: string[];
  createdAt?: string;
}

export interface BotState {
  isPaused: boolean;
  consecutiveLosses: number;
  dailyLossPercent: number;
  lastDailyReset: string;
  totalBalance: number;
  mode: 'analytics';
}
