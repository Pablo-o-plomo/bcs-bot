import { config } from '../config';
import { validatePreTrade } from './riskGate';
import { simulatePaperLimitFill } from './paperEngine';
import { submitLimitOrder } from './orderManager';
import type { ExecutionOrderRequest, ExecutionResult } from './types';

export async function evaluateExecution(order: ExecutionOrderRequest, telegramId?: string): Promise<ExecutionResult> {
  if (order.orderType !== 'LIMIT') throw new Error('Рыночные заявки отключены');
  const validation = await validatePreTrade(order, telegramId);
  if (!validation.allowed) return { status: 'rejected', message: 'Заявка отклонена риск-контролем.', validation };
  if (config.execution.mode === 'disabled') return { status: 'rejected', message: 'Режим заявок отключен.', validation };
  if (config.execution.mode === 'paper') return simulatePaperLimitFill(order, validation);
  if (config.execution.mode === 'manual_confirm') return { status: 'queued_for_confirmation', message: 'Перед лимитной заявкой требуется ручное подтверждение.', validation };
  await submitLimitOrder(order);
}
