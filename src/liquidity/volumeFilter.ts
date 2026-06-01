export function analyzeVolume(volume: number | null | undefined): { ok: boolean; warning: string } {
  if (!volume) return { ok: false, warning: 'Нет данных по объему или объем нулевой.' };
  if (volume < 1_000_000) return { ok: false, warning: 'Низкая ликвидность: объем меньше 1 млн.' };
  if (volume < 10_000_000) return { ok: true, warning: 'Ликвидность средняя, размер позиции лучше уменьшить.' };
  return { ok: true, warning: 'Ликвидность достаточная.' };
}
