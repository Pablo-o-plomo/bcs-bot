import type { AnalysisReport, Trade } from '../database/models';

function rub(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ₽`;
}

export function formatDailyReport(date: string, trades: Trade[], balance: number): string {
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => t.result === 'win' || (t.pnlRub ?? 0) > 0);
  const pnl = closed.reduce((sum, trade) => sum + (trade.pnlRub ?? 0), 0);
  const fees = trades.reduce((sum, trade) => sum + (trade.commissionRub ?? 0), 0);
  const winrate = closed.length ? (wins.length / closed.length) * 100 : 0;
  return `📅 <b>Дневной отчет — ${date}</b>\n\nДепозит: ${balance.toFixed(2)} ₽\nСделок: ${closed.length}\nP&L: ${rub(pnl)}\nКомиссии: ${fees.toFixed(2)} ₽\nWinrate: ${winrate.toFixed(1)}%`;
}

export function formatLearningReport(report: AnalysisReport): string {
  return `🧠 <b>Анализ сделок</b>\n\nСделок: ${report.totalTrades}\nWinrate: ${report.winRate.toFixed(1)}%\nПрофит-фактор: ${report.profitFactor.toFixed(2)}\n\nРекомендации:\n${report.recommendations.map(item => `• ${item}`).join('\n')}`;
}

export function formatSignalMessage(): string {
  return 'Автоматические сигналы отключены в BCS Trading Assistant.';
}

export function formatTradeOpenedMessage(): string {
  return 'Сделка добавлена вручную.';
}

export function formatTradeClosedMessage(trade: Trade): string {
  return `Сделка #${trade.id} закрыта. P&L: ${rub(trade.pnlRub ?? 0)}`;
}

export async function sendTradeUpdate(): Promise<string> {
  return 'Обновление позиции.';
}

export function formatStatusMessage(): string {
  return 'BCS Trading Assistant работает в режиме аналитики.';
}

export function formatErrorAlert(error: string, context?: string): string {
  return `⚠️ <b>Ошибка</b>\n${context ? `Контекст: ${context}\n` : ''}${error}`;
}
