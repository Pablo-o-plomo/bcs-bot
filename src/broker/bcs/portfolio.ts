import { config } from '../../config';
import type { BcsApiClient } from './client';
import type { BcsPortfolio } from './types';
import { normalizePositions } from './positions';
import { getLimits } from './limits';

export async function getPortfolio(client: BcsApiClient): Promise<BcsPortfolio> {
  const raw = await client.request<any>('GET', '/trade-api-bff-portfolio/api/v1/portfolio', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
  const positions = normalizePositions(raw?.positions ?? raw?.securities ?? raw?.assets ?? []);
  const money = raw?.money ?? raw?.summary ?? raw ?? {};
  let limits = { cash: [] as import('./types').BcsCashBalance[] };
  try {
    limits = await getLimits(client);
  } catch {
    limits = { cash: [] };
  }
  const primaryCash = limits.cash.find(item => item.currency === 'RUB') ?? limits.cash[0];
  const totalCash = limits.cash.reduce((sum, item) => sum + item.total, 0);
  const rubAvailable = limits.cash.find(item => item.currency === 'RUB')?.available;
  const positionsValue = positions.reduce((sum, position) => sum + (position.currentPrice * position.quantity), 0);
  const fallbackPortfolioValue = num(money.portfolioValue ?? money.totalAssets ?? money.total ?? money.balance);
  const calculatedPortfolioValue = totalCash + positionsValue;
  const portfolioValue = calculatedPortfolioValue || fallbackPortfolioValue;
  return {
    source: 'BCS API',
    money: {
      balance: portfolioValue,
      freeCash: rubAvailable ?? primaryCash?.available ?? num(money.freeCash ?? money.availableCash ?? money.cash ?? money.freeMoney),
      portfolioValue,
      dayPnl: num(money.dayPnl ?? money.dailyPnl ?? money.pnlDay),
      totalPnl: num(money.totalPnl ?? money.pnl ?? money.profit),
      currency: primaryCash?.currency ?? money.currency ?? 'RUB',
      cash: limits.cash,
    },
    positions,
    updatedAt: new Date().toISOString(),
  };
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
