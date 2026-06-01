export function estimateSlippageRub(positionSizeRub: number, spreadPercent?: number | null): number {
  const spreadPart = spreadPercent ? positionSizeRub * (spreadPercent / 100) * 0.5 : positionSizeRub * 0.0002;
  return Math.round(spreadPart * 100) / 100;
}
