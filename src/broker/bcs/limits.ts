import { config } from '../../config';
import { logger } from '../../utils/logger';
import { sanitizeSecret } from './errors';
import type { BcsApiClient } from './client';
import type { BcsCashBalance, BcsLimits } from './types';

const CURRENCY_KEYS = ['currency', 'currencyCode', 'curr', 'currCode', 'code', 'asset', 'symbol'];
const AVAILABLE_KEYS = ['available', 'availableCash', 'free', 'freeCash', 'cash', 'money', 'balance', 'limit', 'currentLimit', 'availableLimit'];
const BLOCKED_KEYS = ['blocked', 'blockedCash', 'blockedMoney', 'reserved', 'reservedCash', 'hold', 'holdMoney', 'locked', 'lockedCash'];
const TOTAL_KEYS = ['total', 'totalCash', 'totalMoney', 'balance', 'money', 'cash', 'limit', 'currentLimit', 'equity'];

export async function getLimits(client: BcsApiClient): Promise<BcsLimits> {
  const raw = await client.request<any>('GET', '/trade-api-bff-limit/api/v1/limits', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
  logger.info(`BCS limits received: ${describeStructure(raw)}`);
  const cash = parseCashBalances(raw);
  logger.info(`currencies found: ${cash.map(item => item.currency).join(', ') || 'none'}`);
  logger.info(`cash balance parsed: count=${cash.length}`);
  logger.info(`portfolio total calculated: ${cash.map(item => `${item.currency}=${item.total}`).join(', ') || 'none'}`);
  return { cash, rawDebug: buildRawDebug(raw), updatedAt: new Date().toISOString() };
}

export function parseCashBalances(raw: unknown): BcsCashBalance[] {
  const rows = collectCandidateRows(raw);
  const byCurrency = new Map<string, BcsCashBalance>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const currency = String(pick(row, CURRENCY_KEYS) ?? '').trim().toUpperCase();
    if (!currency || currency.length > 8) continue;
    const available = numberOrNull(pick(row, AVAILABLE_KEYS));
    const blocked = numberOrNull(pick(row, BLOCKED_KEYS)) ?? 0;
    const total = numberOrNull(pick(row, TOTAL_KEYS)) ?? ((available ?? 0) + blocked);
    if (available === null && blocked === 0 && total === 0) continue;
    const current = byCurrency.get(currency) ?? { currency, available: 0, blocked: 0, total: 0 };
    current.available += available ?? Math.max(total - blocked, 0);
    current.blocked += blocked;
    current.total += total;
    byCurrency.set(currency, current);
  }
  return [...byCurrency.values()].map(item => ({
    currency: item.currency,
    available: round(item.available),
    blocked: round(item.blocked),
    total: round(item.total),
  })).sort((a, b) => a.currency.localeCompare(b.currency));
}

export function buildRawDebug(raw: unknown): string {
  const sanitized = sanitizeForDebug(raw);
  return sanitizeSecret(JSON.stringify(sanitized, null, 2)).slice(0, 3500);
}

function collectCandidateRows(raw: unknown): any[] {
  const rows: any[] = [];
  const visit = (value: any, depth: number): void => {
    if (depth > 5 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    const hasCurrency = CURRENCY_KEYS.some(key => value[key] !== undefined);
    const hasMoney = [...AVAILABLE_KEYS, ...BLOCKED_KEYS, ...TOTAL_KEYS].some(key => value[key] !== undefined);
    if (hasCurrency && hasMoney) rows.push(value);
    for (const key of ['limits', 'moneyLimits', 'cashLimits', 'currencies', 'balances', 'assets', 'items', 'records', 'data', 'result']) {
      if (value[key] !== undefined) visit(value[key], depth + 1);
    }
  };
  visit(raw, 0);
  return rows;
}

function pick(row: any, keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return undefined;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number): number { return Math.round(value * 100) / 100; }

function describeStructure(raw: unknown): string {
  if (Array.isArray(raw)) return `array length=${raw.length}`;
  if (raw && typeof raw === 'object') return `object keys=${Object.keys(raw as Record<string, unknown>).slice(0, 20).join(',')}`;
  return typeof raw;
}

function sanitizeForDebug(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 10).map(item => sanitizeForDebug(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || lower.includes('account') || lower.includes('client') || lower.includes('name') || lower.includes('fio') || lower.includes('phone') || lower.includes('email')) {
      output[key] = '[redacted]';
    } else {
      output[key] = sanitizeForDebug(nested, depth + 1);
    }
  }
  return output;
}
