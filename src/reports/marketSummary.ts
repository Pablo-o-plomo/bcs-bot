import { getLastNTrades, getOpenTrades } from '../database/db';

export function generateMarketSummary(): string {
  const open = getOpenTrades();
  const closed = getLastNTrades(30);
  const winners = closed.filter(t => (t.pnlRub ?? 0) > 0).length;
  const winrate = closed.length ? (winners / closed.length) * 100 : 0;
  const symbols = Array.from(new Set([...open, ...closed].map(t => t.symbol))).slice(0, 8);

  return `🌍 <b>Сводка портфеля БКС</b>

Инструменты в журнале: ${symbols.join(', ') || 'нет данных'}
Открытых позиций: <b>${open.length}</b>
Закрытых сделок в выборке: <b>${closed.length}</b>
Winrate по последним сделкам: <b>${winrate.toFixed(1)}%</b>

Рекомендация: проверяйте риск до входа и не превышайте лимит на сделку.

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}
