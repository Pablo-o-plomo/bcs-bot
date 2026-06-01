import { config } from '../../config';
import type { BcsApiClient } from './client';
import type { BcsPortfolio } from './types';
import { normalizePositions } from './positions';

export async function getPortfolio(client: BcsApiClient): Promise<BcsPortfolio> {
  const raw = await client.request<any>('GET', '/trade-api-bff-portfolio/api/v1/portfolio', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
  const positions = normalizePositions(raw?.positions ?? raw?.securities ?? raw?.assets ?? []);
  const money = raw?.money ?? raw?.summary ?? raw ?? {};
  return {
    source: 'BCS API',
    money: {
      balance: num(money.balance ?? money.totalAssets ?? money.total ?? money.portfolioValue),
      freeCash: num(money.freeCash ?? money.availableCash ?? money.cash ?? money.freeMoney),
      portfolioValue: num(money.portfolioValue ?? money.totalAssets ?? money.total ?? money.balance),
      dayPnl: num(money.dayPnl ?? money.dailyPnl ?? money.pnlDay),
      totalPnl: num(money.totalPnl ?? money.pnl ?? money.profit),
      currency: money.currency ?? 'RUB',
    },
    positions,
    updatedAt: new Date().toISOString(),
  };
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
