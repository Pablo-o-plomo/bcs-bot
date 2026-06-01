import { getLastNTrades, getOpenTrades } from '../database/db';

export function generateMarketSummary(): string {
  const open = getOpenTrades();
  const closed = getLastNTrades(30);
  const winners = closed.filter(t => t.pnl > 0).length;
  const winrate = closed.length ? (winners / closed.length) * 100 : 0;
  const tickers = Array.from(new Set([...open, ...closed].map(t => t.ticker))).slice(0, 8);
  return `🌍 <b>Сводка портфеля</b>\n\nИнструменты: ${tickers.join(', ') || 'нет данных'}\nОткрытых позиций: <b>${open.length}</b>\nЗакрытых сделок: <b>${closed.length}</b>\nWinrate: <b>${winrate.toFixed(1)}%</b>\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}
