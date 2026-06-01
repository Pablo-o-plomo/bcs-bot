import { getLastNTrades } from '../database/db';

export function generateErrorAnalysis(): string | null {
  const trades = getLastNTrades(20);
  if (!trades.length) return null;
  const weakRr = trades.filter(t => t.rr < 1.5).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  return `🧪 <b>Анализ ошибок</b>\n\nУбыточных сделок: ${losses}\nСделок с RR ниже 1.5: ${weakRr}\nРекомендация: не сохранять сделки без стопа и с плохим RR.\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}
