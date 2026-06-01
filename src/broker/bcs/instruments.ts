import type { BcsApiClient } from './client';
import type { BcsInstrument } from './types';

export async function getInstruments(client: BcsApiClient, query?: string): Promise<BcsInstrument[]> {
  const params: Record<string, unknown> = { page: 0, size: 50 };
  const path = query
    ? `/trade-api-information-service/api/v1/instruments/by-ticker/${encodeURIComponent(query.toUpperCase())}`
    : '/trade-api-information-service/api/v1/instruments/by-type';
  const raw = await client.request<any>('GET', path, undefined, query ? undefined : params);
  const rows = raw?.records ?? raw?.items ?? raw?.content ?? (Array.isArray(raw) ? raw : raw ? [raw] : []);
  return rows.map((row: any) => ({
    ticker: String(row.ticker ?? row.symbol ?? row.secCode ?? query ?? '').toUpperCase(),
    name: row.name ?? row.securityName ?? row.shortName,
    classCode: row.classCode,
    instrumentType: row.instrumentType ?? row.type,
    lotSize: Number(row.lotSize ?? row.lot ?? 1),
  }));
}
