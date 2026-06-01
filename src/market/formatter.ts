import type { MarketInstrument, MarketSnapshot, ScannerSignal, TopListMode } from './types';

export function formatMarketOverview(snapshot: MarketSnapshot, signals: ScannerSignal[], gainers: MarketInstrument[], losers: MarketInstrument[]): string {
  const index = findInstrument(snapshot, 'IMOEX');
  const usdRub = findInstrument(snapshot, 'Si');
  const brent = findInstrument(snapshot, 'BR');
  const gold = findInstrument(snapshot, 'GOLD');
  return `${fallbackNotice(snapshot)}📈 <b>MOEX Market</b>

Состояние рынка: <b>${formatStatus(snapshot.status)}</b>
Источник: <b>${snapshot.source}</b>
Обновлено: <b>${snapshot.updatedAt}</b>

<b>Индексы:</b>
IMOEX: ${formatPrice(index)} / ${formatChange(index?.changePercent)}

<b>Валюта/сырье:</b>
USD/RUB: ${formatPrice(usdRub)} / ${formatChange(usdRub?.changePercent)}
Brent: ${formatPrice(brent)} / ${formatChange(brent?.changePercent)}
Gold: ${formatPrice(gold)} / ${formatChange(gold?.changePercent)}

🔥 <b>Лидеры роста:</b>
${formatCompactList(gainers)}

❄️ <b>Лидеры падения:</b>
${formatCompactList(losers)}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatScanner(snapshot: MarketSnapshot, signals: ScannerSignal[]): string {
  return `${fallbackNotice(snapshot)}🔥 <b>MOEX Scanner</b>

Источник: <b>${snapshot.source}</b>
Обновлено: <b>${snapshot.updatedAt}</b>

${signals.length ? signals.map(formatSignal).join('\n\n') : 'Сигналов по watchlist сейчас нет.'}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatTopList(snapshot: MarketSnapshot, mode: TopListMode, instruments: MarketInstrument[]): string {
  const titles: Record<TopListMode, string> = {
    gainers: '🟢 Лидеры роста',
    losers: '🔴 Лидеры падения',
    volume: '📊 Топ по объему',
  };
  return `${fallbackNotice(snapshot)}${titles[mode]}

Источник: <b>${snapshot.source}</b>
Обновлено: <b>${snapshot.updatedAt}</b>

${formatDetailedList(instruments)}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

function fallbackNotice(snapshot: MarketSnapshot): string {
  return snapshot.fallback ? '⚠️ MOEX API временно недоступен.\nПоказываю cached/mock snapshot.\n\n' : '';
}

function formatSignal(signal: ScannerSignal): string {
  return `<b>${signal.ticker}</b>\nизменение: ${formatChange(signal.changePercent)}\nобъем: ${formatVolume(signal.volume)}\nпричина: ${signal.reasons.join(', ')}`;
}

function formatCompactList(instruments: MarketInstrument[]): string {
  return instruments.length ? instruments.slice(0, 5).map(item => `• <b>${item.ticker}</b>: ${formatChange(item.changePercent)} / объем ${formatVolume(item.volume)}`).join('\n') : 'нет данных';
}

function formatDetailedList(instruments: MarketInstrument[]): string {
  return instruments.length ? instruments.map((item, index) => `${index + 1}. <b>${item.ticker}</b> — ${formatPrice(item)} / ${formatChange(item.changePercent)} / объем ${formatVolume(item.volume)}`).join('\n') : 'нет данных';
}

function findInstrument(snapshot: MarketSnapshot, ticker: string): MarketInstrument | undefined {
  return snapshot.instruments.find(item => item.ticker.toUpperCase() === ticker.toUpperCase());
}

function formatStatus(status: MarketSnapshot['status']): string {
  if (status === 'open') return 'открыт';
  if (status === 'closed') return 'закрыт';
  return 'неизвестно';
}

function formatPrice(item?: MarketInstrument): string {
  if (!item || item.lastPrice === null) return 'нет данных';
  return item.lastPrice.toLocaleString('ru-RU', { maximumFractionDigits: item.lastPrice < 1 ? 5 : 2 });
}

function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'нет данных';
  const sign = value > 0 ? '+' : '';
  return `<b>${sign}${value.toFixed(2)}%</b>`;
}

function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'нет данных';
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}
