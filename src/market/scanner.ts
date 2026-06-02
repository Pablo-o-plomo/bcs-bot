import { config } from '../config';
import { logger } from '../utils/logger';
import { getMarketSnapshot } from './moex';
import type { MarketInstrument, MarketSnapshot, ScannerAction, ScannerRisk, ScannerSignal, ScannerTrend, TopListMode } from './types';

export async function scanMarket(): Promise<{ snapshot: MarketSnapshot; signals: ScannerSignal[] }> {
  logger.info('market_scan_started');
  const snapshot = await getMarketSnapshot();
  const allowed = new Set(config.execution.allowedSymbols.map(symbol => normalizeTicker(symbol)));
  const indexChange = snapshot.instruments.find(item => normalizeTicker(item.ticker) === 'IMOEX')?.changePercent ?? 0;
  const signals = snapshot.instruments
    .filter(item => normalizeTicker(item.ticker) !== 'IMOEX')
    .filter(item => allowed.size === 0 || allowed.has(normalizeTicker(item.ticker)))
    .map(item => buildSignal(item, indexChange))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
  logger.info(`market_scan_finished: signals=${signals.length}`);
  return { snapshot, signals };
}

export async function getTopList(mode: TopListMode): Promise<{ snapshot: MarketSnapshot; instruments: MarketInstrument[] }> {
  const snapshot = await getMarketSnapshot();
  const instruments = snapshot.instruments
    .filter(item => item.ticker.toUpperCase() !== 'IMOEX')
    .sort((a, b) => compareByMode(a, b, mode))
    .slice(0, 7);
  return { snapshot, instruments };
}

function buildSignal(item: MarketInstrument, indexChange: number): ScannerSignal {
  const change = item.changePercent ?? 0;
  const volume = item.volume ?? 0;
  const volatility = item.volatility ?? Math.abs(change);
  const liquidityScore = scoreLiquidity(volume, item.market);
  const momentum = Math.max(-10, Math.min(10, change - indexChange));
  const trend = trendFromChange(change, indexChange);
  const risk = riskFrom(volatility, liquidityScore, trend);
  const confidence = scoreConfidence(change, indexChange, volatility, liquidityScore, risk);
  const action = actionFrom(trend, confidence, risk);
  const commissionRub = estimateCommission(item);
  const reasons: string[] = [];
  if (change > indexChange + 0.8) reasons.push('сильнее индекса');
  if (volume > 2_000_000_000 || (['Si', 'BR', 'GOLD'].includes(item.ticker) && volume > 300_000)) reasons.push('рост объема');
  if (Math.abs(change) >= 1.5) reasons.push('импульс');
  if (change >= 2.2) reasons.push('возможный пробой');
  if (volatility >= 2) reasons.push('повышенная волатильность');
  if (!reasons.length) reasons.push(trend === 'neutral' ? 'нет явного импульса' : 'направленное движение');
  return { ticker: item.ticker, changePercent: item.changePercent, volume: item.volume, reasons, trend, action, confidence, risk, liquidityScore, volatility, commissionRub, momentum };
}

function compareByMode(a: MarketInstrument, b: MarketInstrument, mode: TopListMode): number {
  if (mode === 'gainers') return (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity);
  if (mode === 'losers') return (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity);
  return (b.volume ?? -Infinity) - (a.volume ?? -Infinity);
}

function normalizeTicker(value: string): string {
  return value.toUpperCase();
}

function trendFromChange(change: number, indexChange: number): ScannerTrend {
  if (change >= Math.max(0.6, indexChange + 0.4)) return 'bullish';
  if (change <= Math.min(-0.6, indexChange - 0.4)) return 'bearish';
  return 'neutral';
}

function riskFrom(volatility: number, liquidityScore: number, trend: ScannerTrend): ScannerRisk {
  if (volatility >= 2.5 || liquidityScore < 4) return 'high';
  if (volatility >= 1.4 || liquidityScore < 7 || trend === 'bearish') return 'medium';
  return 'low';
}

function actionFrom(trend: ScannerTrend, confidence: number, risk: ScannerRisk): ScannerAction {
  if (risk === 'high' || confidence < 4.5) return 'SKIP';
  if (trend === 'bullish' && confidence >= 7) return 'LONG';
  if (trend === 'bearish' && confidence >= 7) return 'SHORT';
  return 'WATCH';
}

function scoreLiquidity(volume: number, market: string): number {
  const divisor = market === 'forts' ? 100_000 : 1_000_000_000;
  return Math.max(1, Math.min(10, (volume / divisor) * 2.5));
}

function scoreConfidence(change: number, indexChange: number, volatility: number, liquidityScore: number, risk: ScannerRisk): number {
  const momentumScore = Math.min(3, Math.abs(change - indexChange) * 1.15);
  const impulseScore = Math.min(2, Math.abs(change) * 0.65);
  const liquidityBonus = Math.min(2, liquidityScore / 5);
  const volatilityPenalty = volatility > 2.5 ? 1.2 : volatility > 1.8 ? 0.5 : 0;
  const riskPenalty = risk === 'high' ? 1.3 : risk === 'medium' ? 0.4 : 0;
  return roundOne(Math.max(1, Math.min(10, 4 + momentumScore + impulseScore + liquidityBonus - volatilityPenalty - riskPenalty)));
}

function estimateCommission(item: MarketInstrument): number {
  const notional = item.market === 'forts' ? 10 : Math.max(0, item.lastPrice ?? 0) * 10;
  if (item.market === 'forts') return config.commissions.futuresFeePerContract;
  return roundOne(notional * (config.commissions.stockFeePercent / 100) * 2);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
