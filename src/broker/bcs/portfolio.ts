import type { BcsApiClient } from './client';
import type { BcsPortfolio, BcsPosition } from './types';

export async function getPortfolio(client: BcsApiClient): Promise<BcsPortfolio> {
  const raw = await client.request<any>('GET', '/trade-api-bff-limit/api/v1/limits');
  return normalizeLimits(raw);
}

function normalizeLimits(raw: any): BcsPortfolio {
  const moneyLimits = arr(raw?.moneyLimits);
  const depoLimit = arr(raw?.depoLimit);
  const futureHolding = arr(raw?.futureHolding);
  const futuresLimits = arr(raw?.futuresLimits);

  const rubMoney = moneyLimits.filter(row => String(row?.currency ?? row?.currencyCode ?? row?.currCode ?? '').toUpperCase() === 'RUB');
  const moneyRows = rubMoney.length ? rubMoney : moneyLimits;

  const freeCash = sum(moneyRows, row => firstNum(row, ['availableBalance', 'availableCash', 'freeCash', 'freeMoney', 'currentBalance', 'balance', 'amount', 'value', 'limit']));
  const reservedCash = sum(moneyRows, row => firstNum(row, ['blocked', 'blockedMoney', 'reserved', 'locked', 'margin']));

  const positions = [...normalizeDepo(depoLimit), ...normalizeFutures(futureHolding)];
  const positionValue = positions.reduce((total, position) => total + position.currentPrice * position.quantity, 0);
  const futuresValue = sum(futuresLimits, row => firstNum(row, ['value', 'amount', 'total', 'limit', 'currentBalance', 'balance']));
  const portfolioValue = positionValue || futuresValue || reservedCash;
  const balance = freeCash + portfolioValue;
  const totalPnl = positions.reduce((total, position) => total + position.unrealizedPnl, 0);

  return {
    source: 'BCS API',
    money: {
      balance: round(balance),
      freeCash: round(freeCash),
      portfolioValue: round(portfolioValue),
      dayPnl: 0,
      totalPnl: round(totalPnl),
      currency: 'RUB',
    },
    positions: withShares(positions, portfolioValue),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDepo(rows: any[]): BcsPosition[] {
  return rows.map(row => {
    const quantity = firstNum(row, ['currentBalance', 'balance', 'qty', 'quantity', 'amount', 'openBalance']);
    const value = firstNum(row, ['marketValue', 'currentValue', 'value']);
    const price = firstNum(row, ['currentPrice', 'lastPrice', 'marketPrice', 'price', 'closePrice']) || (quantity ? value / quantity : 0);
    return {
      ticker: String(firstStr(row, ['ticker', 'symbol', 'secCode', 'securityCode', 'instrumentId', 'isin']) || 'UNKNOWN'),
      name: firstStr(row, ['name', 'securityName', 'shortName', 'instrumentName']),
      quantity,
      averagePrice: firstNum(row, ['averagePrice', 'avgPrice', 'priceAvg', 'bookPrice']) || price,
      currentPrice: price,
      unrealizedPnl: firstNum(row, ['unrealizedPnl', 'pnl', 'profit', 'varMargin']),
      portfolioSharePercent: 0,
      instrumentType: firstStr(row, ['instrumentType', 'type']) || 'security',
      classCode: firstStr(row, ['classCode', 'board', 'market']),
    };
  }).filter(row => row.ticker !== 'UNKNOWN' || row.quantity !== 0);
}

function normalizeFutures(rows: any[]): BcsPosition[] {
  return rows.map(row => {
    const quantity = firstNum(row, ['totalNet', 'currentNet', 'balance', 'qty', 'quantity', 'amount']);
    const price = firstNum(row, ['currentPrice', 'lastPrice', 'marketPrice', 'price', 'settlementPrice']);
    return {
      ticker: String(firstStr(row, ['ticker', 'symbol', 'secCode', 'securityCode', 'shortName']) || 'UNKNOWN'),
      name: firstStr(row, ['name', 'securityName', 'shortName', 'instrumentName']),
      quantity,
      averagePrice: firstNum(row, ['averagePrice', 'avgPrice', 'priceAvg', 'settlementPrice']) || price,
      currentPrice: price,
      unrealizedPnl: firstNum(row, ['varMargin', 'unrealizedPnl', 'pnl', 'profit']),
      portfolioSharePercent: 0,
      instrumentType: 'future',
      classCode: firstStr(row, ['classCode', 'board', 'market']) || 'SPBFUT',
    };
  }).filter(row => row.ticker !== 'UNKNOWN' || row.quantity !== 0);
}

function withShares(positions: BcsPosition[], total: number): BcsPosition[] {
  if (total <= 0) return positions;
  return positions.map(position => ({ ...position, portfolioSharePercent: round((position.currentPrice * position.quantity / total) * 100) }));
}

function arr(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function sum(rows: any[], fn: (row: any) => number): number { return rows.reduce((total, row) => total + fn(row), 0); }
function firstStr(row: any, keys: string[]): string | undefined {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim()) return String(row[key]);
  return undefined;
}
function firstNum(row: any, keys: string[]): number {
  for (const key of keys) {
    const value = row?.[key];
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/\s/g, '').replace(',', '.')) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
function round(value: number): number { return Math.round(value * 100) / 100; }
