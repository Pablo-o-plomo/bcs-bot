import { config } from '../config';
import { getTodayTrades } from '../database/db';
import { broadcastMessage } from '../telegram/bot';
import { logger } from '../utils/logger';

export function generateDailyReport(telegramId = config.telegram.adminId || config.telegram.chatId || 'system'): string {
  const trades = getTodayTrades(telegramId);
  const open = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => t.pnl > 0);
  const pnl = closed.reduce((sum, trade) => sum + trade.pnl, 0);
  const fees = trades.reduce((sum, trade) => sum + trade.commission, 0);
  const winrate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const best = [...closed].sort((a, b) => b.pnl - a.pnl).slice(0, 3);
  const worst = [...closed].sort((a, b) => a.pnl - b.pnl).slice(0, 3);

  return `📅 <b>Дневной отчет</b>\n\nОткрытые позиции: <b>${open.length}</b>\nЗакрытые сделки: <b>${closed.length}</b>\nP&L: <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ₽</b>\nКомиссии: <b>${fees.toFixed(2)} ₽</b>\nWinrate: <b>${winrate.toFixed(1)}%</b>\n\nЛучшие сделки:\n${best.length ? best.map(t => `• #${t.id} ${t.ticker}: ${t.pnl} ₽`).join('\n') : 'нет данных'}\n\nХудшие сделки:\n${worst.length ? worst.map(t => `• #${t.id} ${t.ticker}: ${t.pnl} ₽`).join('\n') : 'нет данных'}\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export async function sendDailyReport(): Promise<void> {
  try {
    await broadcastMessage(generateDailyReport());
    logger.info('📋 Daily report sent');
  } catch (err: any) {
    logger.error(`Failed to send daily report: ${err.message}`);
  }
}
