import { logger } from '../utils/logger';
import { getMoexSecurityData } from './moexClient';
import type { MarketInstrument, MarketSnapshot, MarketStatus } from './types';

export const MARKET_WATCHLIST = ['IMOEX', 'SBER', 'GAZP', 'LKOH', 'ROSN', 'YDEX', 'VTBR', 'TATN', 'NVTK', 'MAGN', 'GOLD', 'Si', 'BR'];

let cachedSnapshot: MarketSnapshot | null = null;

const MOCK_INSTRUMENTS: MarketInstrument[] = [
  { ticker: 'IMOEX', name: 'IMOEX', lastPrice: 3120.45, changePercent: 0.35, volume: 0, market: 'index', board: 'SNDX', volatility: null },
  { ticker: 'SBER', name: 'Сбербанк', lastPrice: 285.4, changePercent: 1.24, volume: 13500000000, market: 'shares', board: 'TQBR', volatility: 1.8 },
  { ticker: 'GAZP', name: 'Газпром', lastPrice: 132.7, changePercent: -0.85, volume: 4100000000, market: 'shares', board: 'TQBR', volatility: 1.5 },
  { ticker: 'LKOH', name: 'Лукойл', lastPrice: 7240, changePercent: 0.62, volume: 5200000000, market: 'shares', board: 'TQBR', volatility: 1.2 },
  { ticker: 'ROSN', name: 'Роснефть', lastPrice: 565.8, changePercent: 0.15, volume: 2100000000, market: 'shares', board: 'TQBR', volatility: 1.1 },
  { ticker: 'YDEX', name: 'Яндекс', lastPrice: 4215, changePercent: 2.35, volume: 3900000000, market: 'shares', board: 'TQBR', volatility: 2.6 },
  { ticker: 'VTBR', name: 'ВТБ', lastPrice: 0.024, changePercent: -1.65, volume: 1900000000, market: 'shares', board: 'TQBR', volatility: 2.4 },
  { ticker: 'TATN', name: 'Татнефть', lastPrice: 675.2, changePercent: 0.95, volume: 1600000000, market: 'shares', board: 'TQBR', volatility: 1.9 },
  { ticker: 'NVTK', name: 'Новатэк', lastPrice: 1180.5, changePercent: -2.1, volume: 1750000000, market: 'shares', board: 'TQBR', volatility: 2.8 },
  { ticker: 'MAGN', name: 'ММК', lastPrice: 49.6, changePercent: 1.75, volume: 820000000, market: 'shares', board: 'TQBR', volatility: 2.1 },
  { ticker: 'GOLD', name: 'Gold futures', lastPrice: 2380.2, changePercent: 0.42, volume: 340000, market: 'forts', board: 'RFUD', volatility: 1.4 },
  { ticker: 'Si', name: 'USD/RUB futures', lastPrice: 91250, changePercent: -0.25, volume: 780000, market: 'forts', board: 'RFUD', volatility: 1.3 },
  { ticker: 'BR', name: 'Brent futures', lastPrice: 82.3, changePercent: 1.1, volume: 510000, market: 'forts', board: 'RFUD', volatility: 2.0 },
];

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  if (!isMoexEnabled()) return useFallback('MOEX disabled');
  logger.info('market_api_request: watchlist');
  try {
    const results = await Promise.allSettled(MARKET_WATCHLIST.map(loadInstrument));
    const instruments = results
      .filter((result): result is PromiseFulfilledResult<MarketInstrument> => result.status === 'fulfilled')
      .map(result => result.value);
    const failed = results.length - instruments.length;
    if (!instruments.length) throw new Error('MOEX ISS returned no instruments');
    if (failed > 0) logger.warn(`market_api_failed: partial failed=${failed}`);
    const snapshot: MarketSnapshot = { status: getMarketStatus(), instruments, updatedAt: new Date().toISOString(), source: 'MOEX ISS', fallback: false };
    cachedSnapshot = snapshot;
    logger.info(`market_api_success: instruments=${instruments.length}`);
    return snapshot;
  } catch (err: any) {
    logger.warn(`market_api_failed: ${err?.message ?? err}`);
    return useFallback(err?.message ?? err);
  }
}

async function loadInstrument(ticker: string): Promise<MarketInstrument> {
  const data = await getMoexSecurityData(ticker);
  return {
    ticker: normalizeDisplayTicker(data.ticker, ticker),
    name: data.name,
    lastPrice: data.lastPrice,
    changePercent: data.changePercent,
    volume: data.volume,
    market: data.market,
    board: data.board,
    volatility: data.volatility,
  };
}

function normalizeDisplayTicker(apiTicker: string, requestedTicker: string): string {
  if (requestedTicker === 'Si') return 'Si';
  return apiTicker || requestedTicker;
}

function useFallback(reason: unknown): MarketSnapshot {
  logger.info(`market_cache_used: ${reason}`);
  if (cachedSnapshot) return { ...cachedSnapshot, source: 'cached/mock', fallback: true };
  return { status: 'unknown', instruments: MOCK_INSTRUMENTS, updatedAt: new Date().toISOString(), source: 'cached/mock', fallback: true };
}

function isMoexEnabled(): boolean {
  return process.env.MOEX_ENABLED !== 'false';
}

function getMarketStatus(date = new Date()): MarketStatus {
  const moscowHour = date.getUTCHours() + 3;
  const hour = moscowHour >= 24 ? moscowHour - 24 : moscowHour;
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return 'closed';
  if (hour >= 10 && hour < 19) return 'open';
  return 'closed';
}
