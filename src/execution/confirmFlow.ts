import type { ExecutionOrderRequest, ValidationResult } from './types';

export function formatManualConfirm(order: ExecutionOrderRequest, validation: ValidationResult): string {
  const riskGate = validation.rejects.length ? '❌ Risk gate' : '✅ Risk gate';
  const warnings = validation.warnings.length ? `\n⚠️ ${validation.warnings.slice(0, 3).join(' · ')}` : '';
  const rejects = validation.rejects.length ? `\n❌ ${validation.rejects.slice(0, 3).join(' · ')}` : '';
  return `📈 <b>СИГНАЛ · ${order.symbol}</b>

${order.direction === 'LONG' ? '🟢' : '🔴'} ${order.direction} · <b>${order.entryPrice}</b>
SL 🛡 <b>${order.stopLoss}</b> · TP ✅ <b>${order.takeProfit}</b>
RR <b>1:${order.rr.toFixed(2)}</b> · Risk <b>${order.riskPercent.toFixed(2)}%</b>

TP1 ✅ · TP2 ⏳ · TP3 ❌
Комиссия: <b>~${order.commissionRub.toFixed(2)} ₽</b>
Spread: <b>${order.spreadPercent === null || order.spreadPercent === undefined ? 'нет данных' : `${order.spreadPercent.toFixed(2)}%`}</b>
Liquidity: <b>${order.liquidityOk === false ? 'низкая' : 'нормальная'}</b>
Slippage: <b>${(order.slippageRub ?? 0).toFixed(2)} ₽</b>

${riskGate}${rejects}${warnings}

✅ Подтвердить сделку · ❌ Отмена

⚠️ <i>Реальные заявки отключены. Это не инвестиционная рекомендация.</i>`;
}
