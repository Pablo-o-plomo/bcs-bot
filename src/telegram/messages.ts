import type { AnalysisReport, Trade } from '../database/models';

function rub(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ₽`;
}

export function formatDailyReport(date: string, trades: Trade[]): string {
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => t.pnl > 0);
  const pnl = closed.reduce((sum, trade) => sum + trade.pnl, 0);
  const fees = trades.reduce((sum, trade) => sum + trade.commission, 0);
  const winrate = closed.length ? (wins.length / closed.length) * 100 : 0;
  return `📅 <b>Дневной отчет — ${date}</b>\n\nСделок: ${closed.length}\nP&L: ${rub(pnl)}\nКомиссии: ${fees.toFixed(2)} ₽\nWinrate: ${winrate.toFixed(1)}%\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatLearningReport(report: AnalysisReport): string {
  return `🧠 <b>Анализ сделок</b>\n\nСделок: ${report.totalTrades}\nWinrate: ${report.winRate.toFixed(1)}%\nПрофит-фактор: ${report.profitFactor.toFixed(2)}\n\nРекомендации:\n${report.recommendations.map(item => `• ${item}`).join('\n')}\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatErrorAlert(error: string): string { return `⚠️ <b>Ошибка</b>\n${error}`; }
export function formatSignalMessage(): string { return 'Автосигналы отключены.'; }
export function formatTradeOpenedMessage(): string { return 'Сделка сохранена вручную.'; }
export function formatTradeClosedMessage(trade: Trade): string { return `Сделка #${trade.id} закрыта. P&L: ${rub(trade.pnl)}`; }
export async function sendTradeUpdate(): Promise<string> { return 'Обновление позиции.'; }
export function formatStatusMessage(): string { return 'BCS Assistant Bot работает. Автоторговля отключена.'; }
