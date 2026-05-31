import { config } from '../config';
import { getTodayTrades, getUserSettings } from '../database/db';
import { broadcastMessage } from '../telegram/bot';
import { logger } from '../utils/logger';

export function generateDailyReport(telegramId = config.telegram.adminId || config.telegram.chatId || 'system'): string {
  const settings = getUserSettings(telegramId);
  const trades = getTodayTrades(telegramId);
  const open = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => t.result === 'win' || (t.pnlRub ?? 0) > 0);
  const pnl = closed.reduce((sum, trade) => sum + (trade.pnlRub ?? 0), 0);
  const fees = trades.reduce((sum, trade) => sum + (trade.commissionRub ?? 0), 0);
  const winrate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const best = [...closed].sort((a, b) => (b.pnlRub ?? 0) - (a.pnlRub ?? 0)).slice(0, 3);
  const worst = [...closed].sort((a, b) => (a.pnlRub ?? 0) - (b.pnlRub ?? 0)).slice(0, 3);

  return `📅 <b>Дневной отчет</b>

Депозит: <b>${settings.depositRub.toFixed(2)} ₽</b>
Открытые позиции: <b>${open.length}</b>
Закрытые сделки: <b>${closed.length}</b>
Прибыль/убыток: <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ₽</b>
Комиссии: <b>${fees.toFixed(2)} ₽</b>
Winrate: <b>${winrate.toFixed(1)}%</b>

Лучшие сделки:
${best.length ? best.map(t => `• #${t.id} ${t.symbol}: ${t.pnlRub ?? 0} ₽`).join('\n') : 'нет данных'}

Худшие сделки:
${worst.length ? worst.map(t => `• #${t.id} ${t.symbol}: ${t.pnlRub ?? 0} ₽`).join('\n') : 'нет данных'}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export async function sendDailyReport(): Promise<void> {
  try {
    await broadcastMessage(generateDailyReport());
    logger.info('📋 Daily report sent');
  } catch (err: any) {
    logger.error(`Failed to send daily report: ${err.message}`);
  }
}
