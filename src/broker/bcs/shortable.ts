import type { BcsApiClient } from './client';
import { bcsApiClient } from './client';
import { logger } from '../../utils/logger';

const DEFAULT_SHORTABLE = new Set(['SBER', 'GAZP', 'LKOH', 'SI', 'BR', 'GOLD', 'IMOEX']);

export async function canShort(symbol: string, client: BcsApiClient = bcsApiClient): Promise<boolean> {
  return (await borrowAvailable(symbol, client)).available;
}

export async function borrowAvailable(symbol: string, client: BcsApiClient = bcsApiClient): Promise<{ available: boolean; reason: string }> {
  const ticker = symbol.toUpperCase();
  if (client.isEnabled()) {
    try {
      const raw = await client.request<any>('GET', '/trade-api-bff-marginal-indicators/api/v1/instruments-discounts');
      const rows = Array.isArray(raw) ? raw : raw?.records ?? [];
      const item = rows.find((row: any) => String(row.ticker ?? '').toUpperCase() === ticker);
      if (item) {
        const discountShort = Number(item.discountShort ?? 0);
        return { available: discountShort > 0, reason: discountShort > 0 ? `Шорт доступен, discountShort=${discountShort}.` : 'Шорт недоступен по данным БКС.' };
      }
    } catch (err: any) {
      logger.warn(`BCS short availability fallback for ${ticker}: ${err.message}`);
    }
  }
  const available = DEFAULT_SHORTABLE.has(ticker);
  return { available, reason: available ? 'Шорт предварительно доступен по локальному whitelist; проверьте условия БКС перед сделкой.' : 'Шорт недоступен или инструмент не поддерживается.' };
}
