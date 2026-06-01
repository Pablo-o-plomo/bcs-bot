import { getOpenTrades, getWinrateBySymbol } from '../database/db';

export function generateHeartbeatReport(): string {
  const openTrades = getOpenTrades().length;
  const rows = getWinrateBySymbol();
  const avgWinrate = rows.length ? rows.reduce((sum, row) => sum + row.winrate, 0) / rows.length : 0;
  return `💓 <b>Бот работает</b>\n\nОткрытых сделок: <b>${openTrades}</b>\nСредний winrate: <b>${avgWinrate.toFixed(1)}%</b>\nАвтоторговля: <b>выключена</b>`;
}
