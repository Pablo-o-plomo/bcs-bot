import { config } from '../config';
import { validatePreTrade } from './riskGate';
import { simulatePaperLimitFill } from './paperEngine';
import { submitLimitOrder } from './orderManager';
import type { ExecutionOrderRequest, ExecutionResult } from './types';

export async function evaluateExecution(order: ExecutionOrderRequest, telegramId?: string): Promise<ExecutionResult> {
  if (order.orderType !== 'LIMIT') throw new Error('Market orders are disabled');
  const validation = await validatePreTrade(order, telegramId);
  if (!validation.allowed) return { status: 'rejected', message: 'Execution rejected by risk gate.', validation };
  if (config.execution.mode === 'disabled') return { status: 'rejected', message: 'Execution mode disabled.', validation };
  if (config.execution.mode === 'paper') return simulatePaperLimitFill(order, validation);
  if (config.execution.mode === 'manual_confirm') return { status: 'queued_for_confirmation', message: 'Manual confirmation required before LIMIT order.', validation };
  await submitLimitOrder(order);
}
