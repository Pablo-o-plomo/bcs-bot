import { config } from '../../config';
import type { BcsApiClient } from './client';
import type { BcsPosition } from './types';

export async function getPositions(client: BcsApiClient): Promise<BcsPosition[]> {
  const raw = await client.request<any>('GET', '/trade-api-bff-portfolio/api/v1/portfolio', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
  return normalizePositions(Array.isArray(raw) ? raw : raw?.positions ?? raw?.securities ?? raw?.assets ?? raw?.records ?? raw?.items ?? raw?.data ?? []);
}

export function normalizePositions(rows: any[]): BcsPosition[] {
  const list = Array.isArray(rows) ? rows.filter(isPortfolioPositionRow) : [];
  const totalValue = list.reduce((sum, row) => sum + num(row.currentValueRub ?? row.currentValue ?? row.marketValue ?? row.amount ?? row.value), 0);
  return list.map(row => {
    const quantity = num(row.quantity ?? row.balance ?? row.qty ?? row.amount);
    const averagePrice = num(row.averagePrice ?? row.avgPrice ?? row.avgEntryPrice ?? row.priceAvg);
    const currentPrice = num(row.currentPrice ?? row.lastPrice ?? row.marketPrice ?? row.price);
    const currentValueRub = num(row.currentValueRub ?? row.currentValue ?? row.marketValue ?? currentPrice * quantity);
    const portfolioShare = num(row.portfolioShare);
    const unrealizedPL = num(row.unrealizedPL ?? row.unrealizedPnl ?? row.pnl ?? row.profit);
    return {
      ticker: String(row.ticker ?? row.symbol ?? row.securityCode ?? row.secCode ?? 'UNKNOWN'),
      name: row.displayName ?? row.name ?? row.securityName ?? row.shortName,
      exchange: row.exchange,
      quantity,
      averagePrice,
      currentPrice,
      currentValueRub,
      balanceValueRub: num(row.balanceValueRub),
      dailyPL: num(row.dailyPL),
      dailyPercentPL: num(row.dailyPercentPL),
      unrealizedPL,
      unrealizedPercentPL: num(row.unrealizedPercentPL),
      unrealizedPnl: unrealizedPL,
      portfolioShare,
      portfolioSharePercent: portfolioShare || (totalValue > 0 ? round((currentValueRub / totalValue) * 100) : 0),
      instrumentType: row.instrumentType,
      classCode: row.classCode,
    };
  });
}

function isPortfolioPositionRow(row: any): boolean {
  return row?.type !== 'moneyLimit' && row?.instrumentType !== 'CURRENCY' && num(row?.quantity ?? row?.balance ?? row?.qty ?? row?.amount) > 0;
}

function num(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function round(value: number): number { return Math.round(value * 100) / 100; }
