import type { Direction, InstrumentType } from '../database/models';

export type ExecutionMode = 'manual_confirm' | 'paper' | 'semi_auto' | 'disabled';
export type OrderType = 'LIMIT';

export interface ExecutionOrderRequest {
  symbol: string;
  direction: Direction;
  instrumentType: InstrumentType;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  orderType: OrderType | 'MARKET' | 'STOP_MARKET';
  commissionRub: number;
  spreadPercent?: number | null;
  liquidityOk?: boolean;
  slippageRub?: number;
  rr: number;
  riskPercent: number;
  comment?: string;
}

export interface ValidationResult {
  allowed: boolean;
  warnings: string[];
  rejects: string[];
}

export interface ExecutionResult {
  status: 'paper_filled' | 'queued_for_confirmation' | 'sent' | 'rejected';
  message: string;
  validation: ValidationResult;
  simulatedFillPrice?: number;
}
