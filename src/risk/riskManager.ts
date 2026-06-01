import { config } from '../config';
import type { Direction } from '../database/models';

export interface PositionRiskInput {
  depositRub: number;
  entryPrice: number;
  stopLoss?: number;
  quantity: number;
  direction: Direction;
  commissionRub: number;
  riskPerTradePercent?: number;
  spreadPercent?: number | null;
  slippageRub?: number;
  portfolioSharePercent?: number;
  correlatedExposurePercent?: number;
}

export interface PositionRiskResult {
  positionSizeRub: number;
  riskRub: number;
  riskPercent: number;
  allowed: boolean;
  reason: string;
}

export interface RiskRewardInput {
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  direction: Direction;
}

export interface RiskRewardResult {
  riskPerUnit: number;
  rewardPerUnit: number;
  rr: number;
}

export function calculatePositionRisk(input: PositionRiskInput): PositionRiskResult {
  const positionSizeRub = round(input.entryPrice * input.quantity);
  if (!input.stopLoss || input.stopLoss <= 0) {
    return { positionSizeRub, riskRub: 0, riskPercent: 0, allowed: false, reason: 'Сделка запрещена: стоп-лосс обязателен.' };
  }

  const riskPerUnit = input.direction === 'LONG'
    ? input.entryPrice - input.stopLoss
    : input.stopLoss - input.entryPrice;
  if (riskPerUnit <= 0) {
    return { positionSizeRub, riskRub: 0, riskPercent: 0, allowed: false, reason: 'Сделка запрещена: стоп-лосс расположен неверно для выбранного направления.' };
  }

  const liquidityCost = (input.slippageRub ?? 0) + (input.spreadPercent ? positionSizeRub * (input.spreadPercent / 100) * 0.5 : 0);
  const riskRub = round(riskPerUnit * input.quantity + input.commissionRub + liquidityCost);
  const riskPercent = input.depositRub > 0 ? round((riskRub / input.depositRub) * 100) : 0;
  const limit = input.riskPerTradePercent ?? config.trading.riskPerTrade;
  if (riskPercent > limit) {
    return { positionSizeRub, riskRub, riskPercent, allowed: false, reason: `Сделка запрещена: риск ${riskPercent.toFixed(2)}% выше лимита ${limit.toFixed(2)}%.` };
  }
  if ((input.portfolioSharePercent ?? 0) > 30) {
    return { positionSizeRub, riskRub, riskPercent, allowed: false, reason: `Сделка запрещена: концентрация ${input.portfolioSharePercent?.toFixed(1)}% выше лимита 30%.` };
  }
  const concentrationWarning = (input.correlatedExposurePercent ?? 0) > 30 ? ` У тебя уже ${input.correlatedExposurePercent?.toFixed(0)}% портфеля в похожих инструментах.` : '';
  return { positionSizeRub, riskRub, riskPercent, allowed: true, reason: `Сделка разрешена: риск ${riskPercent.toFixed(2)}% в пределах лимита ${limit.toFixed(2)}%.${concentrationWarning}` };
}

export function calculateRiskReward(input: RiskRewardInput): RiskRewardResult {
  if (!input.stopLoss || !input.takeProfit) return { riskPerUnit: 0, rewardPerUnit: 0, rr: 0 };
  const riskPerUnit = input.direction === 'LONG'
    ? input.entryPrice - input.stopLoss
    : input.stopLoss - input.entryPrice;
  const rewardPerUnit = input.direction === 'LONG'
    ? input.takeProfit - input.entryPrice
    : input.entryPrice - input.takeProfit;
  return {
    riskPerUnit: round(Math.max(0, riskPerUnit)),
    rewardPerUnit: round(Math.max(0, rewardPerUnit)),
    rr: riskPerUnit > 0 ? round(Math.max(0, rewardPerUnit) / riskPerUnit) : 0,
  };
}

export function riskRewardWarning(rr: number): string | null {
  return rr > 0 && rr < 1.5 ? '⚠️ RR ниже 1.5 — сделку стоит доработать или пропустить.' : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
