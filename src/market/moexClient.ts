import axios from 'axios';
import { config } from '../config';

export interface MoexSecurityData {
  ticker: string;
  name: string;
  lastPrice: number | null;
  changePercent: number | null;
  volume: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  spreadPercent: number | null;
  volatility: number | null;
  market: string;
  board: string;
}

const TICKER_OVERRIDES: Record<string, { engine: string; market: string; board: string; security: string }> = {
  IMOEX: { engine: 'stock', market: 'index', board: 'SNDX', security: 'IMOEX' },
  SI: { engine: 'futures', market: 'forts', board: 'RFUD', security: 'Si' },
  BR: { engine: 'futures', market: 'forts', board: 'RFUD', security: 'BR' },
  GOLD: { engine: 'futures', market: 'forts', board: 'RFUD', security: 'GOLD' },
};

export async function getMoexSecurityData(tickerRaw: string): Promise<MoexSecurityData> {
  if (!config.moex.enabled) throw new Error('MOEX_ENABLED=false');
  const ticker = tickerRaw.trim().toUpperCase();
  const candidates = buildCandidates(ticker);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const data = await fetchCandidate(candidate.security, candidate.engine, candidate.market, candidate.board);
      if (data.lastPrice !== null || data.name !== candidate.security) return data;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError ?? new Error(`Тикер ${ticker} не найден в MOEX ISS`);
}

function buildCandidates(ticker: string): Array<{ engine: string; market: string; board: string; security: string }> {
  const override = TICKER_OVERRIDES[ticker];
  if (override) return [override];
  return [
    { engine: 'stock', market: 'shares', board: 'TQBR', security: ticker },
    { engine: 'stock', market: 'bonds', board: 'TQOB', security: ticker },
    { engine: 'stock', market: 'selt', board: 'CETS', security: ticker },
    { engine: 'futures', market: 'forts', board: 'RFUD', security: ticker },
  ];
}

async function fetchCandidate(security: string, engine: string, market: string, board: string): Promise<MoexSecurityData> {
  const url = `${config.moex.baseUrl}/engines/${engine}/markets/${market}/boards/${board}/securities/${encodeURIComponent(security)}.json`;
  const response = await axios.get(url, { params: { 'iss.meta': 'off' }, timeout: 7000 });
  const json = response.data;
  const securities = tableToObjects(json.securities);
  const marketdata = tableToObjects(json.marketdata);
  if (!securities.length && !marketdata.length) throw new Error(`Нет данных MOEX для ${security} на ${board}`);
  const sec = securities[0] ?? {};
  const md = marketdata[0] ?? {};
  return {
    ticker: sec.SECID ?? md.SECID ?? security,
    name: sec.SECNAME ?? sec.SHORTNAME ?? security,
    lastPrice: numberOrNull(md.LAST ?? md.LASTVALUE ?? md.CURRENTVALUE ?? md.LCURRENTPRICE),
    changePercent: numberOrNull(md.LASTCHANGEPRCNT ?? md.CHANGE ?? md.LASTCHANGETOOPENPRC),
    volume: numberOrNull(md.VOLTODAY ?? md.VALTODAY ?? md.QTY ?? md.NUMTRADES),
    bid: numberOrNull(md.BID ?? md.BIDDEPTHT),
    ask: numberOrNull(md.OFFER ?? md.ASK ?? md.OFFERDEPTHT),
    spread: calculateSpread(numberOrNull(md.BID), numberOrNull(md.OFFER ?? md.ASK)),
    spreadPercent: calculateSpreadPercent(numberOrNull(md.BID), numberOrNull(md.OFFER ?? md.ASK)),
    volatility: numberOrNull(md.VOLATILITY ?? md.VOLTODAY_PCT),
    market,
    board,
  };
}

function tableToObjects(table: any): any[] {
  if (!table?.columns || !Array.isArray(table.data)) return [];
  return table.data.map((row: any[]) => Object.fromEntries(table.columns.map((column: string, index: number) => [column, row[index]])));
}

function numberOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function calculateSpread(bid: number | null, ask: number | null): number | null {
  if (!bid || !ask || ask < bid) return null;
  return Math.round((ask - bid) * 10000) / 10000;
}

function calculateSpreadPercent(bid: number | null, ask: number | null): number | null {
  if (!bid || !ask || ask < bid) return null;
  const mid = (ask + bid) / 2;
  return mid > 0 ? Math.round(((ask - bid) / mid) * 10000) / 100 : null;
}

export function formatMoexAnalysis(data: MoexSecurityData): string {
  const change = data.changePercent ?? 0;
  const comment = change > 1
    ? 'инструмент заметно растет, вход лучше рассматривать только после плана и контроля риска'
    : change < -1
      ? 'инструмент под давлением, проверьте поддержку и не входите без стопа'
      : 'движение умеренное, дождитесь подтверждения уровня и объема';

  return `📈 <b>Анализ инструмента MOEX: ${data.ticker}</b>\n\nНазвание: <b>${data.name}</b>\nЦена: <b>${data.lastPrice === null ? 'нет данных' : data.lastPrice.toFixed(2)}</b>\nИзменение: <b>${data.changePercent === null ? 'нет данных' : `${data.changePercent.toFixed(2)}%`}</b>\nОбъем: <b>${data.volume === null ? 'нет данных' : data.volume.toLocaleString('ru-RU')}</b>\nРынок/режим: <b>${data.market}/${data.board}</b>\nКомментарий: ${comment}.\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}
