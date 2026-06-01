export function calculatePositionSize(input: { deposit: number; riskPercent: number; entry: number; stop: number; instrumentType: string; contractMultiplier?: number; commission?: number; slippage?: number }): { quantity: number; positionSizeRub: number; riskRub: number } {
  const riskBudget = input.deposit * (input.riskPercent / 100);
  const perUnitRisk = Math.abs(input.entry - input.stop) * (input.contractMultiplier ?? 1);
  const costs = (input.commission ?? 0) + (input.slippage ?? 0);
  const availableRisk = Math.max(0, riskBudget - costs);
  const quantity = perUnitRisk > 0 ? Math.floor(availableRisk / perUnitRisk) : 0;
  return { quantity, positionSizeRub: quantity * input.entry * (input.contractMultiplier ?? 1), riskRub: quantity * perUnitRisk + costs };
}
