import { calculateBcsCommission } from './commission_bcs';
import type { BcsTradeInput, RiskCalculation } from '../database/models';

export function calculateTradeRisk(input: BcsTradeInput, depositRub: number): RiskCalculation {
  const positionAmountRub = input.entryPrice * input.quantity;
  const perUnitRisk = input.direction === 'LONG'
    ? input.entryPrice - input.stopLoss
    : input.stopLoss - input.entryPrice;
  const perUnitProfit = input.direction === 'LONG'
    ? input.takeProfit - input.entryPrice
    : input.entryPrice - input.takeProfit;

  const grossRiskRub = Math.max(0, perUnitRisk * input.quantity);
  const potentialProfitRub = Math.max(0, perUnitProfit * input.quantity);
  const commission = calculateBcsCommission({
    instrumentType: input.instrumentType,
    turnoverRub: positionAmountRub,
    quantity: input.quantity,
    isCurrencyPurchase: input.instrumentType === 'currency' && input.direction === 'LONG',
    manualCommissionRub: input.commissionRub,
  });
  const commissionRub = commission.commissionRub;
  const riskRub = grossRiskRub + commissionRub;

  return {
    positionAmountRub: round(positionAmountRub),
    riskRub: round(riskRub),
    riskPercentOfDeposit: depositRub > 0 ? round((riskRub / depositRub) * 100) : 0,
    potentialProfitRub: round(potentialProfitRub),
    riskReward: riskRub > 0 ? round(potentialProfitRub / riskRub) : 0,
    commissionRub,
    pnlAtTakeProfitRub: round(potentialProfitRub - commissionRub),
    pnlAtStopRub: round(-grossRiskRub - commissionRub),
  };
}

export function formatRiskCalculation(risk: RiskCalculation): string {
  return `📐 <b>Расчет риска</b>

• Сумма позиции: <b>${risk.positionAmountRub.toFixed(2)} ₽</b>
• Риск: <b>${risk.riskRub.toFixed(2)} ₽</b>
• Риск от депозита: <b>${risk.riskPercentOfDeposit.toFixed(2)}%</b>
• Потенциальная прибыль: <b>${risk.potentialProfitRub.toFixed(2)} ₽</b>
• Risk/Reward: <b>1:${risk.riskReward.toFixed(2)}</b>
• Комиссия: <b>${risk.commissionRub.toFixed(2)} ₽</b>
• P&L на тейке с комиссией: <b>${risk.pnlAtTakeProfitRub.toFixed(2)} ₽</b>
• P&L на стопе с комиссией: <b>${risk.pnlAtStopRub.toFixed(2)} ₽</b>`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
