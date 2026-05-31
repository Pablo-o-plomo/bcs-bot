export type Direction = 'LONG' | 'SHORT';
export type InstrumentType = 'stock' | 'future' | 'currency' | 'bond' | 'fund' | 'option';
export type TradeStatus = 'open' | 'closed_win' | 'closed_loss' | 'closed_breakeven' | 'closed_manual';
export type TradeResult = 'win' | 'loss' | 'breakeven';

export interface BcsUser {
  id?: number;
  telegramId: string;
  username?: string;
  createdAt?: string;
}

export interface UserSettings {
  id?: number;
  userId?: number;
  telegramId: string;
  depositRub: number;
  riskPerTradePercent: number;
  broker: string;
}

export interface Instrument {
  id?: number;
  ticker: string;
  name?: string;
  type: InstrumentType;
  lotSize: number;
  priceStep?: number;
  currency: string;
}

export interface BrokerFee {
  id?: number;
  name: string;
  value: number;
  unit: 'rub' | 'percent' | 'rub_per_contract';
  editable: boolean;
}

export interface BcsTradeInput {
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
}

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

export interface Trade {
  id?: number;
  signalId?: number;
  telegramId?: string;
  symbol: string;
  instrumentType?: InstrumentType;
  direction: Direction;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit?: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  quantity?: number;
  positionSize: number;
  leverage: number;
  status: TradeStatus | string;
  result?: TradeResult;
  pnlPercent?: number;
  pnlRub?: number;
  pnlUsdt?: number;
  finalPnl?: number;
  currentPnl?: number;
  commissionRub?: number;
  riskRub?: number;
  riskPercent?: number;
  riskReward?: number;
  closeReason?: string;
  comment?: string;
  entryReasons: string[];
  exitReason?: string;
  exitAnalysis?: string;
  improvements?: string[];
  errorTags?: ErrorTag[];
  indicatorsAtEntry?: IndicatorSnapshot;
  progress?: TradeProgress;
  openedAt?: string;
  closedAt?: string;
}

export interface Position {
  id?: number;
  tradeId: number;
  telegramId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice?: number;
  openedAt?: string;
}

export interface PortfolioSnapshot {
  id?: number;
  telegramId: string;
  depositRub: number;
  openPositions: number;
  totalPnlRub: number;
  feesRub: number;
  createdAt?: string;
}

export interface AiReview {
  id?: number;
  tradeId?: number;
  telegramId: string;
  requestText: string;
  reviewText: string;
  createdAt?: string;
}

export interface InstrumentAnalysis {
  ticker: string;
  trend: string;
  levels: string[];
  entry: string;
  stop: string;
  takeProfit: string;
  risk: string;
  decision: string;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalIndicatorSummary {
  ema20: number;
  ema50: number;
  ema200: number;
  emaAlignment: string;
  rsi: number;
  rsiState: string;
  macd: 'bullish' | 'bearish' | 'neutral';
  macdState: string;
  atr: number;
  atrPercent: number;
  volumeRatio: number;
  volumeState: 'none' | 'low' | 'weak' | 'normal' | 'high';
}

export interface Signal {
  id?: number;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskPercent: number;
  positionSize: number;
  leverage: number;
  riskReward: number;
  confidence: number;
  reasons: string[];
  warnings: string[];
  timeframeConfirmations: string[];
  indicatorSummary: SignalIndicatorSummary;
  cancelConditions: string[];
  timeframe: string;
  status: 'pending' | 'active' | 'cancelled' | 'expired';
  createdAt?: string;
  indicators?: IndicatorSnapshot;
}

export interface TradeProgress {
  tp1: boolean;
  tp2: boolean;
  tp3: boolean;
  breakeven: boolean;
  partiallyClosed: boolean;
}

export interface IndicatorSnapshot {
  price: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  atr: number;
  volumeAvg: number;
  volumeCurrent: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  timeframe: string;
  timestamp: number;
}

export type ErrorTag =
  | 'late_entry'
  | 'weak_volume'
  | 'false_breakout'
  | 'bad_risk_reward'
  | 'trend_against_trade'
  | 'overtrading'
  | 'news_volatility'
  | 'stop_too_tight'
  | 'stop_too_wide'
  | 'missed_target'
  | 'early_exit'
  | 'correct_execution';

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
  pausedUntil?: string;
  pauseReason?: string;
  consecutiveLosses: number;
  dailyLossPercent: number;
  lastDailyReset: string;
  totalBalance: number;
  mode: 'analytics';
}
