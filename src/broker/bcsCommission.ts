import { config } from '../config';
import type { Direction, InstrumentType } from '../database/models';

export interface BcsCommissionParams {
  instrumentType: InstrumentType;
  price: number;
  quantity: number;
  direction?: Direction;
  ticker?: string;
  stockFeePercent?: number;
  currencyFeePercent?: number;
  futuresFeePerContract?: number;
  extraCurrencyBuyFeePercent?: number;
}

export interface BcsCommissionResult {
  turnover: number;
  commissionRub: number;
  details: string;
}

const CURRENCY_WITH_EXTRA_BUY_FEE = new Set(['USD', 'EUR', 'HKD', 'GBP']);

export function calculateBcsCommission(params: BcsCommissionParams): BcsCommissionResult {
  const turnover = round(params.price * params.quantity);
  const stockFeePercent = params.stockFeePercent ?? config.commissions.stockFeePercent;
  const currencyFeePercent = params.currencyFeePercent ?? config.commissions.currencyFeePercent;
  const futuresFeePerContract = params.futuresFeePerContract ?? config.commissions.futuresFeePerContract;
  const extraCurrencyBuyFeePercent = params.extraCurrencyBuyFeePercent ?? config.commissions.extraCurrencyBuyFeePercent;

  if (params.instrumentType === 'future') {
    const commissionRub = round(params.quantity * futuresFeePerContract);
    return { turnover, commissionRub, details: `Фьючерсы: ${futuresFeePerContract} ₽ за контракт × ${params.quantity}.` };
  }

  if (params.instrumentType === 'option') {
    const rawFee = params.quantity * futuresFeePerContract;
    const cap = turnover * (config.commissions.optionsMaxPercent / 100);
    const commissionRub = round(Math.min(rawFee, cap));
    return { turnover, commissionRub, details: `Опционы: комиссия ограничена ${config.commissions.optionsMaxPercent}% от оборота.` };
  }

  if (params.instrumentType === 'currency') {
    const ticker = (params.ticker ?? '').toUpperCase();
    const hasExtra = params.direction === 'LONG' && CURRENCY_WITH_EXTRA_BUY_FEE.has(ticker);
    const feePercent = currencyFeePercent + (hasExtra ? extraCurrencyBuyFeePercent : 0);
    const commissionRub = round(turnover * (feePercent / 100));
    return {
      turnover,
      commissionRub,
      details: `Валюта: ${currencyFeePercent}% от оборота${hasExtra ? ` + ${extraCurrencyBuyFeePercent}% за покупку ${ticker}` : ''}.`,
    };
  }

  const commissionRub = round(turnover * (stockFeePercent / 100));
  return {
    turnover,
    commissionRub,
    details: `Акции/фонды/облигации: ${stockFeePercent}% от оборота.`,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
