import { logger } from '../utils/logger';
import { getMarketSnapshot } from './moex';
import type { MarketInstrument, MarketSnapshot, ScannerSignal, TopListMode } from './types';

export async function scanMarket(): Promise<{ snapshot: MarketSnapshot; signals: ScannerSignal[] }> {
  logger.info('market_scan_started');
  const snapshot = await getMarketSnapshot();
  const indexChange = snapshot.instruments.find(item => item.ticker.toUpperCase() === 'IMOEX')?.changePercent ?? 0;
  const signals = snapshot.instruments
    .filter(item => item.ticker.toUpperCase() !== 'IMOEX')
    .map(item => buildSignal(item, indexChange))
    .filter(signal => signal.reasons.length > 0)
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
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
  const reasons: string[] = [];
  if (change > indexChange + 0.8) reasons.push('сильнее индекса');
  if (volume > 2_000_000_000 || (['Si', 'BR', 'GOLD'].includes(item.ticker) && volume > 300_000)) reasons.push('рост объема');
  if (Math.abs(change) >= 1.5) reasons.push('импульс');
  if (change >= 2.2) reasons.push('возможный пробой');
  if (volatility >= 2) reasons.push('повышенная волатильность');
  return { ticker: item.ticker, changePercent: item.changePercent, volume: item.volume, reasons };
}

function compareByMode(a: MarketInstrument, b: MarketInstrument, mode: TopListMode): number {
  if (mode === 'gainers') return (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity);
  if (mode === 'losers') return (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity);
  return (b.volume ?? -Infinity) - (a.volume ?? -Infinity);
}
