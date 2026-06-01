import { getLastNTrades, saveAnalysisReport } from '../database/db';
import type { AnalysisReport } from '../database/models';

export function generateLearningReport(n = 20): AnalysisReport | null {
  const trades = getLastNTrades(n);
  if (trades.length < 5) return null;
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const report: AnalysisReport = {
    periodStart: trades[trades.length - 1]?.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    periodEnd: trades[0]?.closedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgProfit: wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0,
    avgLoss: losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0,
    profitFactor: Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) ? wins.reduce((s, t) => s + t.pnl, 0) / Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) : 0,
    bestSetups: ['Сделки с заранее заданным стопом и RR выше 1.5'],
    worstSetups: ['Сделки без подтверждения уровня'],
    frequentErrors: ['Слабый RR', 'Завышенный риск'],
    recommendations: ['Сохранять риск постоянным', 'Не входить без стопа'],
  };
  saveAnalysisReport(report);
  return report;
}

export async function runLearningAnalysis(): Promise<void> {}
