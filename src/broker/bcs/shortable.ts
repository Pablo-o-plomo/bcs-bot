import type { BcsApiClient } from './client';

const SHORTABLE = new Set(['SBER', 'GAZP', 'LKOH', 'SI', 'BR', 'GOLD', 'IMOEX']);

export async function canShort(symbol: string, _client?: BcsApiClient): Promise<boolean> {
  return SHORTABLE.has(symbol.toUpperCase());
}

export async function borrowAvailable(symbol: string, client?: BcsApiClient): Promise<{ available: boolean; reason: string }> {
  const allowed = await canShort(symbol, client);
  return { available: allowed, reason: allowed ? 'Шорт предварительно доступен; проверьте условия брокера перед сделкой.' : 'Шорт по инструменту недоступен или не входит в whitelist.' };
}
