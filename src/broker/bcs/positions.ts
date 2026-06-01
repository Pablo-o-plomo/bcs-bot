import { config } from '../../config';
import type { BcsApiClient } from './client';
import type { BcsPosition } from './types';

export async function getPositions(client: BcsApiClient): Promise<BcsPosition[]> {
  const raw = await client.request<any>('GET', '/trade-api-bff-portfolio/api/v1/portfolio', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
  return normalizePositions(raw?.positions ?? raw?.securities ?? raw?.assets ?? raw?.records ?? raw ?? []);
}

export function normalizePositions(rows: any[]): BcsPosition[] {
  const list = Array.isArray(rows) ? rows : [];
  const totalValue = list.reduce((sum, row) => sum + num(row.currentValue ?? row.marketValue ?? row.amount ?? row.value), 0);
  return list.map(row => {
    const quantity = num(row.quantity ?? row.balance ?? row.qty ?? row.amount);
    const averagePrice = num(row.averagePrice ?? row.avgPrice ?? row.avgEntryPrice ?? row.priceAvg);
    const currentPrice = num(row.currentPrice ?? row.lastPrice ?? row.marketPrice ?? row.price);
    const value = num(row.currentValue ?? row.marketValue ?? currentPrice * quantity);
    return {
      ticker: String(row.ticker ?? row.symbol ?? row.securityCode ?? row.secCode ?? 'UNKNOWN'),
      name: row.name ?? row.securityName ?? row.shortName,
      quantity,
      averagePrice,
      currentPrice,
      unrealizedPnl: num(row.unrealizedPnl ?? row.pnl ?? row.profit),
      portfolioSharePercent: totalValue > 0 ? round((value / totalValue) * 100) : 0,
      instrumentType: row.instrumentType,
      classCode: row.classCode,
    };
  });
}

function num(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function round(value: number): number { return Math.round(value * 100) / 100; }
