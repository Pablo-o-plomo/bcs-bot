import { calculateBcsCommission } from '../bcsCommission';
import type { BcsCommissionBreakdown } from './types';

export function calculateNetPnl(params: { grossPnl: number; price: number; quantity: number; instrumentType: any; direction?: any; ticker?: string; exchangeFeeRub?: number; slippageRub?: number }): BcsCommissionBreakdown {
  const broker = calculateBcsCommission({ instrumentType: params.instrumentType, price: params.price, quantity: params.quantity, direction: params.direction, ticker: params.ticker });
  const exchangeFee = params.exchangeFeeRub ?? broker.turnover * 0.0001;
  const estimatedSlippage = params.slippageRub ?? broker.turnover * 0.0002;
  const fees = broker.commissionRub + exchangeFee;
  return { grossPnl: params.grossPnl, netPnl: params.grossPnl - fees - estimatedSlippage, fees, estimatedSlippage, details: [broker.details, `Биржевые сборы: ${exchangeFee.toFixed(2)} ₽`, `Оценка проскальзывания: ${estimatedSlippage.toFixed(2)} ₽`] };
}
