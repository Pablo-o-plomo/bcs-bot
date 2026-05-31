import { config } from '../config';
import type { InstrumentType } from '../database/models';

export interface BcsCommissionInput {
  instrumentType: InstrumentType;
  turnoverRub: number;
  quantity: number;
  isCurrencyPurchase?: boolean;
  isOption?: boolean;
  manualCommissionRub?: number;
}

export interface BcsCommissionResult {
  commissionRub: number;
  description: string;
}

export function calculateBcsCommission(input: BcsCommissionInput): BcsCommissionResult {
  if (input.manualCommissionRub !== undefined && Number.isFinite(input.manualCommissionRub)) {
    return { commissionRub: input.manualCommissionRub, description: 'Комиссия задана пользователем вручную.' };
  }

  if (input.instrumentType === 'future') {
    const value = input.quantity * config.commissions.futuresFeeRubPerContract;
    return {
      commissionRub: roundRub(value),
      description: `Срочный рынок: ${config.commissions.futuresFeeRubPerContract} ₽ за контракт.`,
    };
  }

  if (input.instrumentType === 'option' || input.isOption) {
    const cap = input.turnoverRub * (config.commissions.optionsMaxPercent / 100);
    const base = input.quantity * config.commissions.futuresFeeRubPerContract;
    return {
      commissionRub: roundRub(Math.min(base, cap)),
      description: `Опционы: не более ${config.commissions.optionsMaxPercent}% от объема сделки.`,
    };
  }

  if (input.instrumentType === 'currency') {
    const baseRate = config.commissions.currencyRatePercent;
    const extraRate = input.isCurrencyPurchase ? config.commissions.currencyPurchaseExtraPercent : 0;
    const value = input.turnoverRub * ((baseRate + extraRate) / 100);
    return {
      commissionRub: roundRub(value),
      description: `Валюта: ${baseRate}%${extraRate ? ` + ${extraRate}% за покупку USD/EUR/HKD/GBP` : ''}.`,
    };
  }

  const value = input.turnoverRub * (config.commissions.securitiesRatePercent / 100);
  return {
    commissionRub: roundRub(value),
    description: `Ценные бумаги/фонды/облигации: ${config.commissions.securitiesRatePercent}% от оборота.`,
  };
}

export function getBcsCommissionSummary(): string {
  return `💰 <b>Комиссии БКС</b>

• Обслуживание: ${config.commissions.monthlyServiceRub} ₽/мес при наличии операций
• Ценные бумаги: ${config.commissions.securitiesRatePercent}% от оборота (настраивается 0.04–0.008%)
• Валюта: ${config.commissions.currencyRatePercent}% от оборота (настраивается 0.04–0.008%)
• Покупка USD/EUR/HKD/GBP: +${config.commissions.currencyPurchaseExtraPercent}%
• Срочные контракты: ${config.commissions.futuresFeeRubPerContract} ₽ за контракт (диапазон 0.08–1.2 ₽)
• Опционы: не более ${config.commissions.optionsMaxPercent}% от объема сделки

Настройки можно изменить через .env: BCS_MONTHLY_SERVICE_RUB, BCS_SECURITIES_RATE_PERCENT, BCS_CURRENCY_RATE_PERCENT, BCS_CURRENCY_PURCHASE_EXTRA_PERCENT, BCS_FUTURES_FEE_RUB_PER_CONTRACT, BCS_OPTIONS_MAX_PERCENT.`;
}

function roundRub(value: number): number {
  return Math.round(value * 100) / 100;
}
