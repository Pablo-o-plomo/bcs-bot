import { config } from '../../config';
import { logger } from '../../utils/logger';
import { sanitizeSecret } from './errors';
import type { BcsApiClient } from './client';
import type { BcsCashBalance, BcsLimits } from './types';

const SUPPORTED_CURRENCIES = new Set(['RUB', 'USD', 'EUR', 'CNY']);
const CURRENCY_KEYS = ['currency', 'currencyCode', 'curr', 'currCode', 'code', 'asset', 'symbol'];
const AVAILABLE_KEYS = ['available', 'availableCash', 'free', 'freeCash', 'cash', 'money', 'balance', 'amount', 'limit', 'currentLimit', 'availableLimit'];
const BLOCKED_KEYS = ['blocked', 'blockedCash', 'blockedMoney', 'reserved', 'reservedCash', 'hold', 'holdMoney', 'locked', 'lockedCash'];
const TOTAL_KEYS = ['total', 'totalCash', 'totalMoney', 'balance', 'money', 'cash', 'amount', 'limit', 'currentLimit', 'equity'];
const MONEY_KEYS = [...new Set([...AVAILABLE_KEYS, ...BLOCKED_KEYS, ...TOTAL_KEYS])];

export async function getLimits(client: BcsApiClient): Promise<BcsLimits> {
  const raw = await client.request<any>('GET', '/trade-api-bff-limit/api/v1/limits', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
  const rawKeys = collectRawKeys(raw);
  const rawDebug = buildRawDebug(raw);
  logger.info(`BCS limits received: ${describeStructure(raw)}`);
  logger.info(`BCS limits raw keys: ${rawKeys.join(', ') || 'none'}`);
  logger.info(`BCS limits sanitized response: ${buildSafeJson(raw)}`);
  const cash = parseCashBalances(raw);
  logger.info(`BCS limits currencies found: ${cash.map(item => item.currency).join(', ') || 'none'}`);
  logger.info(`BCS limits cash balances parsed count: ${cash.length}`);
  logger.info(`cash balance parsed: count=${cash.length}`);
  logger.info(`portfolio total calculated: ${cash.map(item => `${item.currency}=${item.total}`).join(', ') || 'none'}`);
  return { cash, rawDebug, updatedAt: new Date().toISOString() };
}

export function parseCashBalances(raw: unknown): BcsCashBalance[] {
  const rows = collectCandidateRows(raw);
  const byCurrency = new Map<string, BcsCashBalance>();
  parseMoneyLimits(raw, byCurrency);
  for (const row of rows) {
    if (isBcsMoneyLimitRow(row.values)) continue;
    const currency = normalizeCurrency(row.currency);
    if (!currency) continue;
    const available = firstNumber(row.values, AVAILABLE_KEYS);
    const blocked = firstNumber(row.values, BLOCKED_KEYS) ?? 0;
    const totalValue = firstNumber(row.values, TOTAL_KEYS);
    const total = totalValue ?? ((available ?? 0) + blocked);
    const resolvedAvailable = available ?? Math.max(total - blocked, 0);
    if (!hasMeaningfulMoneyValue(row.values)) continue;
    const current = byCurrency.get(currency) ?? { currency, available: 0, blocked: 0, total: 0 };
    current.available += resolvedAvailable;
    current.blocked += blocked;
    current.total += total;
    byCurrency.set(currency, current);
  }
  return [...byCurrency.values()].map(item => ({
    currency: item.currency,
    available: round(item.available),
    blocked: round(item.blocked),
    total: round(item.total),
  })).sort((a, b) => preferredCurrencyOrder(a.currency) - preferredCurrencyOrder(b.currency));
}

export function buildRawDebug(raw: unknown): string {
  return buildSafeJson(raw).slice(0, 3500);
}

interface CashCandidateRow {
  currency: unknown;
  values: Record<string, unknown>;
}

interface MoneyLimitDebugRow {
  currency: string;
  exchange: string;
  quantityValue: number;
  locked: number;
}

function parseMoneyLimits(raw: unknown, byCurrency: Map<string, BcsCashBalance>): void {
  const moneyLimits = findMoneyLimits(raw);
  const debugRows: MoneyLimitDebugRow[] = [];
  for (const row of moneyLimits) {
    const currency = normalizeCurrency(row.currencyCode ?? row.currency ?? row.curr ?? row.code);
    if (!currency) continue;
    const quantityValue = numberOrNull((row.quantity as Record<string, unknown> | undefined)?.value) ?? numberOrNull(row.quantity) ?? 0;
    const locked = numberOrNull(row.locked) ?? numberOrNull(row.blocked) ?? 0;
    const current = byCurrency.get(currency) ?? { currency, available: 0, blocked: 0, total: 0 };
    current.available += quantityValue;
    current.blocked += locked;
    current.total += quantityValue + locked;
    byCurrency.set(currency, current);
    debugRows.push({ currency, exchange: String(row.exchange ?? 'unknown'), quantityValue: round(quantityValue), locked: round(locked) });
  }
  logger.info(`BCS moneyLimits parsed: ${debugRows.length ? debugRows.map(row => `currency=${row.currency}, exchange=${row.exchange}, quantityValue=${row.quantityValue}, locked=${row.locked}`).join(' | ') : 'none'}`);
}

function findMoneyLimits(raw: unknown): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || !value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'moneyLimits' && Array.isArray(nested)) {
        rows.push(...nested.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)));
      } else {
        visit(nested, depth + 1);
      }
    }
  };
  visit(raw, 0);
  return rows;
}

function isBcsMoneyLimitRow(row: Record<string, unknown>): boolean {
  return row.instrumentType === 'MONEY' && (row.quantity !== undefined || row.currencyCode !== undefined);
}

function collectCandidateRows(raw: unknown): CashCandidateRow[] {
  const rows: CashCandidateRow[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, depth: number, inheritedCurrency?: string): void => {
    if (depth > 12 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1, inheritedCurrency);
      return;
    }
    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    const objectValue = value as Record<string, unknown>;
    const directCurrency = normalizeCurrency(pick(objectValue, CURRENCY_KEYS));
    const currency = directCurrency ?? inheritedCurrency;
    if (currency && hasMeaningfulMoneyValue(objectValue)) {
      rows.push({ currency, values: objectValue });
    }

    for (const [key, nested] of Object.entries(objectValue)) {
      const keyCurrency = normalizeCurrency(key);
      visit(nested, depth + 1, keyCurrency ?? currency ?? undefined);
    }
  };

  visit(raw, 0);
  return rows;
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberOrNull(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function hasMeaningfulMoneyValue(row: Record<string, unknown>): boolean {
  return MONEY_KEYS.some(key => numberOrNull(row[key]) !== null);
}

function normalizeCurrency(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toUpperCase().replace(/[^A-Z]/g, '');
  return SUPPORTED_CURRENCIES.has(normalized) ? normalized : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number): number { return Math.round(value * 100) / 100; }

function preferredCurrencyOrder(currency: string): number {
  const order = ['RUB', 'USD', 'EUR', 'CNY'];
  const index = order.indexOf(currency);
  return index === -1 ? order.length : index;
}

function describeStructure(raw: unknown): string {
  if (Array.isArray(raw)) return `array length=${raw.length}`;
  if (raw && typeof raw === 'object') return `object keys=${Object.keys(raw as Record<string, unknown>).slice(0, 20).join(',')}`;
  return typeof raw;
}

function collectRawKeys(raw: unknown): string[] {
  const keys = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || !value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 50)) visit(item, depth + 1);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      keys.add(key);
      visit(nested, depth + 1);
    }
  };
  visit(raw, 0);
  return [...keys].slice(0, 80);
}

function buildSafeJson(raw: unknown): string {
  return sanitizeSecret(JSON.stringify(sanitizeForDebug(raw), null, 2));
}

function sanitizeForDebug(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitizeForDebug(item, depth + 1));
  if (typeof value === 'string') return sanitizeSecret(value);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (isSensitiveKey(lower)) {
      output[key] = '[redacted]';
    } else {
      output[key] = sanitizeForDebug(nested, depth + 1);
    }
  }
  return output;
}

function isSensitiveKey(lowerKey: string): boolean {
  return ['token', 'account', 'client', 'name', 'fio', 'phone', 'email', 'passport', 'address', 'inn', 'snils'].some(part => lowerKey.includes(part));
}
