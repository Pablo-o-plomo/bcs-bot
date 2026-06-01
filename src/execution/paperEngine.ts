import type { ExecutionOrderRequest, ExecutionResult, ValidationResult } from './types';

export function simulatePaperLimitFill(order: ExecutionOrderRequest, validation: ValidationResult): ExecutionResult {
  if (!validation.allowed) return { status: 'rejected', message: 'Paper execution rejected by risk gate.', validation };
  const spreadCost = order.spreadPercent ? order.entryPrice * (order.spreadPercent / 100) * 0.5 : 0;
  const slippagePerUnit = (order.slippageRub ?? 0) / Math.max(1, order.quantity);
  const simulatedFillPrice = order.direction === 'LONG' ? order.entryPrice + spreadCost + slippagePerUnit : order.entryPrice - spreadCost - slippagePerUnit;
  return { status: 'paper_filled', message: 'Paper LIMIT fill simulated with spread/slippage/commission.', validation, simulatedFillPrice };
}
