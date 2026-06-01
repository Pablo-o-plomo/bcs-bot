import type { BcsApiClient } from './client';
import type { BcsMarketData } from './types';
import { getMoexSecurityData } from '../../market/moexClient';
import { getSessionStatus } from '../../session/marketSessions';
import { logger } from '../../utils/logger';

const CLASS_BY_SYMBOL: Record<string, string> = {
  SBER: 'TQBR',
  GAZP: 'TQBR',
  LKOH: 'TQBR',
  IMOEX: 'SNDX',
  SI: 'SPBFUT',
  BR: 'SPBFUT',
  GOLD: 'SPBFUT',
};

export async function getMarketData(client: BcsApiClient, ticker: string): Promise<BcsMarketData> {
  const normalized = ticker.toUpperCase();
  const classCode = CLASS_BY_SYMBOL[normalized] ?? 'TQBR';
  try {
    const raw = await client.request<any>('GET', '/trade-api-market-data-connector/api/v1/quotes', undefined, { ticker: normalized, classCode });
    const quote = Array.isArray(raw?.records) ? raw.records[0] : Array.isArray(raw) ? raw[0] : raw?.data ?? raw;
    return normalizeMarketData(normalized, classCode, quote, 'BCS API');
  } catch (err: any) {
    logger.warn(`BCS market data unavailable for ${normalized}, fallback to MOEX: ${err.message}`);
    const moex = await getMoexSecurityData(normalized);
    return {
      ticker: moex.ticker,
      classCode,
      price: moex.lastPrice,
      lastPrice: moex.lastPrice,
      volume: moex.volume,
      bid: moex.bid,
      ask: moex.ask,
      spread: moex.spread,
      spreadPercent: moex.spreadPercent,
      volatility: moex.volatility,
      sessionStatus: getSessionStatus(new Date()).label,
      source: 'MOEX ISS fallback',
      updatedAt: new Date().toISOString(),
    };
  }
}

function normalizeMarketData(ticker: string, classCode: string, row: any, source: 'BCS API'): BcsMarketData {
  const bid = num(row?.bid ?? row?.bestBid ?? row?.bidPrice);
  const ask = num(row?.ask ?? row?.bestAsk ?? row?.askPrice);
  const lastPrice = numOrNull(row?.lastPrice ?? row?.last ?? row?.price ?? row?.close);
  const spread = bid !== null && ask !== null ? round(ask - bid) : null;
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : lastPrice;
  return {
    ticker: String(row?.ticker ?? row?.symbol ?? ticker).toUpperCase(),
    classCode: row?.classCode ?? classCode,
    price: lastPrice,
    lastPrice,
    volume: numOrNull(row?.volume ?? row?.turnover ?? row?.qty),
    bid,
    ask,
    spread,
    spreadPercent: spread !== null && mid ? round((spread / mid) * 100) : null,
    volatility: numOrNull(row?.volatility ?? row?.changePercent ?? row?.changePct),
    sessionStatus: getSessionStatus(new Date()).label,
    source,
    updatedAt: new Date().toISOString(),
  };
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function numOrNull(value: unknown): number | null { return num(value); }
function round(value: number): number { return Math.round(value * 10000) / 10000; }
