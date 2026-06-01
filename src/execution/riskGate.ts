import { config } from '../config';
import { getOpenTrades, getTodayTrades, getUserSettings } from '../database/db';
import { analyzeSpread } from '../liquidity/spreadFilter';
import { analyzeVolume } from '../liquidity/volumeFilter';
import { getSessionStatus } from '../session/marketSessions';
import { borrowAvailable } from '../broker/bcs/shortable';
import { isEmergencyStopped, recordReject } from './emergencyStop';
import type { ExecutionOrderRequest, ValidationResult } from './types';

export async function validatePreTrade(order: ExecutionOrderRequest, telegramId?: string): Promise<ValidationResult> {
  const warnings: string[] = [];
  const rejects: string[] = [];
  const normalized = order.symbol.toUpperCase();
  const allowed = config.execution.allowedSymbols.map(s => s.toUpperCase()).includes(normalized);
  if (!allowed) rejects.push('Инструмент не входит в whitelist.');
  if (order.orderType !== 'LIMIT') rejects.push('Market orders are disabled');
  if (isEmergencyStopped()) rejects.push('Emergency stop active.');

  const session = getSessionStatus(new Date());
  if (session.code === 'closed') rejects.push(`Рынок закрыт: ${session.warning}`);
  if (session.code === 'low_liquidity') warnings.push(session.warning);

  const spread = analyzeSpread(order.spreadPercent);
  warnings.push(spread.warning);
  if (!spread.ok) rejects.push(spread.warning);
  const volume = analyzeVolume(order.liquidityOk === false ? 0 : 10_000_000);
  warnings.push(volume.warning);
  if (!volume.ok) rejects.push(volume.warning);

  if (order.riskPercent > config.execution.maxPositionPercent) rejects.push(`Риск ${order.riskPercent.toFixed(2)}% выше MAX_POSITION_PERCENT=${config.execution.maxPositionPercent}%.`);
  if (telegramId) {
    if (getOpenTrades(telegramId).length >= config.execution.maxOpenPositions) rejects.push(`Открытых позиций больше лимита MAX_OPEN_POSITIONS=${config.execution.maxOpenPositions}.`);
    const settings = getUserSettings(telegramId);
    const dailyPnl = getTodayTrades(telegramId).reduce((sum, trade) => sum + Number(trade.pnl ?? 0), 0);
    const dailyLossPercent = dailyPnl < 0 ? Math.abs(dailyPnl) / settings.depositRub * 100 : 0;
    if (dailyLossPercent > config.execution.maxDailyLossPercent) rejects.push(`Дневной убыток ${dailyLossPercent.toFixed(2)}% выше MAX_DAILY_LOSS_PERCENT=${config.execution.maxDailyLossPercent}%.`);
  }
  if (order.rr < 1.5) rejects.push(`RR ${order.rr.toFixed(2)} ниже 1.5.`);
  if (order.commissionRub > Math.abs(order.takeProfit - order.entryPrice) * order.quantity * 0.25) warnings.push('Комиссия может съесть значимую часть edge.');
  if (!config.execution.allowShorts && order.direction === 'SHORT') rejects.push('Шорты отключены настройкой ALLOW_SHORTS=false.');
  if (order.direction === 'SHORT') {
    const short = await borrowAvailable(order.symbol);
    if (!short.available) rejects.push(short.reason);
    else warnings.push(short.reason);
  }

  if (rejects.length) for (const reject of rejects) recordReject(reject);
  return { allowed: rejects.length === 0, warnings, rejects };
}
