import type { Direction } from '../database/models';

export function getPriceDecimals(symbol: string): number {
  if (symbol.toUpperCase().includes('SI')) return 0;
  return 2;
}

export function formatPrice(symbol: string, price: number): string {
  return price.toFixed(getPriceDecimals(symbol));
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatUnsignedPercent(value: number): string {
  return `${Math.abs(value).toFixed(2)}%`;
}

export function formatDirection(direction: Direction): string {
  return direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
}

export function formatTradingViewLink(symbol: string): string {
  return `MOEX:${symbol.toUpperCase()}`;
}
