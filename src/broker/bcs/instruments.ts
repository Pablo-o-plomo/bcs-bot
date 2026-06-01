import type { BcsApiClient } from './client';
import type { BcsInstrument, BcsMarketData } from './types';
import { getMoexSecurityData } from '../../market/moexClient';
import { getSessionStatus } from '../../session/marketSessions';

export async function getInstruments(client: BcsApiClient, query?: string): Promise<BcsInstrument[]> {
  const path = query ? `/trade-api-bff-info/api/v1/instruments?query=${encodeURIComponent(query)}` : '/trade-api-bff-info/api/v1/instruments';
  const raw = await client.request<any>('GET', path);
  return (raw?.records ?? raw ?? []).map((row: any) => ({ ticker: row.ticker ?? row.symbol, name: row.name ?? row.securityName, classCode: row.classCode, instrumentType: row.instrumentType, lotSize: row.lotSize }));
}

export async function getMarketData(_client: BcsApiClient, ticker: string): Promise<BcsMarketData> {
  const moex = await getMoexSecurityData(ticker);
  return {
    ticker: moex.ticker,
    price: moex.lastPrice,
    volume: moex.volume,
    bid: moex.bid,
    ask: moex.ask,
    spread: moex.spread,
    spreadPercent: moex.spreadPercent,
    volatility: moex.volatility,
    sessionStatus: getSessionStatus(new Date()).label,
  };
}
