export function analyzeSpread(spreadPercent: number | null | undefined): { ok: boolean; warning: string } {
  if (spreadPercent === null || spreadPercent === undefined) return { ok: true, warning: 'Спред недоступен.' };
  if (spreadPercent > 0.5) return { ok: false, warning: `Высокий spread ${spreadPercent.toFixed(2)}% — сделка может потерять edge.` };
  if (spreadPercent > 0.2) return { ok: true, warning: `Spread ${spreadPercent.toFixed(2)}% повышенный, учитывайте проскальзывание.` };
  return { ok: true, warning: `Spread ${spreadPercent.toFixed(2)}% в норме.` };
}
