import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { BcsApiClient } from './client';
import type { BcsCashBalance, BcsPortfolio, BcsPosition } from './types';
import { getLimits } from './limits';

const TERM_PRIORITY = ['T0', 'T1', 'T2'];

export async function getPortfolio(client: BcsApiClient): Promise<BcsPortfolio> {
  const raw = await client.request<any>('GET', '/trade-api-bff-portfolio/api/v1/portfolio', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
  const items = getPortfolioItems(raw);
  logger.info(`BCS portfolio items received: ${items.length}`);

  const portfolioMoney = parsePortfolioMoney(items);
  logger.info(`BCS portfolio moneyLimit count: ${items.filter(isMoneyLimitItem).length}`);

  const positions = parsePortfolioPositions(items);
  logger.info(`BCS portfolio positions parsed count: ${positions.length}`);
  logger.info(`BCS portfolio position tickers: ${positions.map(position => position.ticker).join(', ') || 'none'}`);

  let limitsCash: BcsCashBalance[] = [];
  try {
    limitsCash = (await getLimits(client)).cash;
  } catch {
    limitsCash = [];
  }

  const cash = limitsCash.length ? limitsCash : portfolioMoney;
  const primaryCash = cash.find(item => item.currency === 'RUB') ?? cash[0];
  const totalCash = cash.reduce((sum, item) => sum + (item.currentValueRub ?? item.total), 0);
  const rubAvailable = cash.find(item => item.currency === 'RUB')?.available;
  const positionsValue = positions.reduce((sum, position) => sum + (position.currentValueRub ?? 0), 0);
  const portfolioValue = totalCash + positionsValue;
  const dayPnl = positions.reduce((sum, position) => sum + (position.dailyPL ?? 0), 0);
  const totalPnl = positions.reduce((sum, position) => sum + (position.unrealizedPL ?? position.unrealizedPnl ?? 0), 0);

  return {
    source: 'BCS API',
    money: {
      balance: portfolioValue,
      freeCash: rubAvailable ?? primaryCash?.available ?? 0,
      portfolioValue,
      dayPnl,
      totalPnl,
      currency: primaryCash?.currency ?? 'RUB',
      cash,
    },
    positions,
    updatedAt: new Date().toISOString(),
  };
}

function getPortfolioItems(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw.filter(isObjectRecord);
  if (!isObjectRecord(raw)) return [];
  const container = raw as Record<string, unknown>;
  for (const key of ['items', 'positions', 'securities', 'assets', 'records', 'data']) {
    const value = container[key];
    if (Array.isArray(value)) return value.filter(isObjectRecord);
  }
  return [];
}

function parsePortfolioMoney(items: Array<Record<string, unknown>>): BcsCashBalance[] {
  const moneyLimits = items.filter(isMoneyLimitItem);
  const byCurrency = new Map<string, Array<Record<string, unknown>>>();
  for (const item of moneyLimits) {
    const currency = normalizeCurrency(item.currency ?? item.ticker);
    if (!currency) continue;
    const rows = byCurrency.get(currency) ?? [];
    rows.push(item);
    byCurrency.set(currency, rows);
  }

  return [...byCurrency.entries()].map(([currency, rows]) => {
    const selectedTerm = selectTerm(rows);
    const selectedRows = rows.filter(row => normalizeTerm(row.term) === selectedTerm);
    const quantity = selectedRows.reduce((sum, row) => sum + num(row.quantity), 0);
    const locked = selectedRows.reduce((sum, row) => sum + num(row.locked), 0);
    const currentValueRub = selectedRows.reduce((sum, row) => sum + firstNum(row.currentValueRub, row.balanceValueRub), 0);
    return {
      currency,
      available: round(quantity),
      blocked: round(locked),
      total: round(quantity),
      currentValueRub: round(currentValueRub),
      term: selectedTerm,
    };
  }).sort((a, b) => preferredCurrencyOrder(a.currency) - preferredCurrencyOrder(b.currency));
}

function parsePortfolioPositions(items: Array<Record<string, unknown>>): BcsPosition[] {
  return items.filter(isPortfolioPositionItem).map(row => {
    const quantity = num(row.quantity);
    const currentPrice = num(row.currentPrice);
    const currentValueRub = num(row.currentValueRub);
    const unrealizedPL = num(row.unrealizedPL);
    const portfolioShare = num(row.portfolioShare);
    return {
      ticker: String(row.ticker ?? 'UNKNOWN'),
      name: stringOrUndefined(row.displayName),
      exchange: stringOrUndefined(row.exchange),
      quantity,
      averagePrice: num(row.averagePrice ?? row.avgPrice ?? row.avgEntryPrice ?? row.priceAvg),
      currentPrice,
      currentValueRub,
      balanceValueRub: num(row.balanceValueRub),
      dailyPL: num(row.dailyPL),
      dailyPercentPL: num(row.dailyPercentPL),
      unrealizedPL,
      unrealizedPercentPL: num(row.unrealizedPercentPL),
      unrealizedPnl: unrealizedPL,
      portfolioShare,
      portfolioSharePercent: portfolioShare,
      instrumentType: stringOrUndefined(row.instrumentType),
      classCode: stringOrUndefined(row.classCode),
    };
  });
}

function isPortfolioPositionItem(row: Record<string, unknown>): boolean {
  return !isMoneyLimitItem(row) && row.instrumentType !== 'CURRENCY' && num(row.quantity) > 0;
}

function isMoneyLimitItem(row: Record<string, unknown>): boolean {
  return row.type === 'moneyLimit';
}

function selectTerm(rows: Array<Record<string, unknown>>): string {
  let selected = 'T2';
  let selectedPriority = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const term = normalizeTerm(row.term);
    const priority = TERM_PRIORITY.indexOf(term);
    const resolvedPriority = priority === -1 ? TERM_PRIORITY.length : priority;
    if (resolvedPriority < selectedPriority) {
      selected = term;
      selectedPriority = resolvedPriority;
    }
  }
  return selected;
}

function normalizeTerm(value: unknown): string {
  return String(value ?? 'T2').toUpperCase();
}

function normalizeCurrency(value: unknown): string | null {
  const currency = String(value ?? '').trim().toUpperCase();
  return currency || null;
}

function firstNum(...values: unknown[]): number {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function preferredCurrencyOrder(currency: string): number {
  return ['RUB', 'USD', 'EUR', 'CNY'].indexOf(currency) === -1 ? 99 : ['RUB', 'USD', 'EUR', 'CNY'].indexOf(currency);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}
