import { config } from '../config';
import { bcsApiClient } from '../broker/bcs/client';
import { logger } from '../utils/logger';
import type { ExecutionOrderRequest } from './types';

export async function submitLimitOrder(order: ExecutionOrderRequest): Promise<never> {
  logger.warn(`execution attempt: symbol=${order.symbol}, type=${order.orderType}, mode=${config.execution.mode}`);
  if (order.orderType !== 'LIMIT') throw new Error('Market orders are disabled');
  if (!config.allowOrderExecution || config.readOnlyMode) throw new Error('Order execution disabled');
  return bcsApiClient.executeOrder();
}
