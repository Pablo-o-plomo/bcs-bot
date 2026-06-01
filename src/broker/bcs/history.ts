import type { BcsApiClient } from './client';
import type { BcsTrade } from './types';

export async function getTrades(client: BcsApiClient): Promise<BcsTrade[]> {
  const endDateTime = new Date().toISOString();
  const startDateTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const raw = await client.request<any>('POST', '/trade-api-bff-trade-details/api/v1/trades/search', { startDateTime, endDateTime }, { page: 0, size: 100, sort: 'tradeDateTime,desc' });
  return (raw?.records ?? raw ?? []).map((row: any) => ({
    externalId: String(row.tradeNum ?? row.id ?? `${row.ticker}-${row.tradeDateTime}-${row.price}`),
    ticker: String(row.ticker ?? 'UNKNOWN'),
    side: row.side === '2' || row.side === 'SELL' ? 'SELL' : 'BUY',
    price: num(row.price),
    quantity: num(row.tradeQuantity ?? row.quantity ?? row.tradeQuantityLots),
    volume: num(row.volume ?? row.contractAmount),
    commission: num(row.commission),
    tradeDateTime: row.tradeDateTime ?? row.dateTime ?? new Date().toISOString(),
    instrumentType: row.instrumentType,
    classCode: row.classCode,
  }));
}

function num(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
