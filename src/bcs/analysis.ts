import type { BcsTradeInput, InstrumentAnalysis } from '../database/models';
import { calculateTradeRisk } from './risk';

const KNOWN_LEVELS: Record<string, { support: string; resistance: string; trend: string }> = {
  SBER: { support: 'ближайшая зона спроса у дневной EMA/локального минимума', resistance: 'локальный максимум предыдущей недели', trend: 'умеренно восходящий при удержании поддержки' },
  GAZP: { support: 'диапазон накопления и нижняя граница боковика', resistance: 'верхняя граница боковика', trend: 'боковой/слабый до выхода из диапазона' },
  LKOH: { support: 'предыдущий пробитый максимум', resistance: 'круглый уровень и зона фиксации прибыли', trend: 'среднесрочно сильнее рынка' },
  IMOEX: { support: 'нижняя граница рыночного диапазона', resistance: 'верхняя граница рыночного диапазона', trend: 'индикатор общего аппетита к риску' },
  SI: { support: 'уровень спроса по USD/RUB', resistance: 'верхняя граница волатильного диапазона', trend: 'зависит от курса рубля и нефти' },
  BR: { support: 'зона покупателя по Brent', resistance: 'локальные максимумы фьючерса', trend: 'волатильный товарный инструмент' },
  GOLD: { support: 'зона покупателя по золоту', resistance: 'исторические/локальные максимумы', trend: 'защитный актив, чувствителен к ставкам' },
};

export function analyzeInstrument(tickerRaw: string): InstrumentAnalysis {
  const ticker = tickerRaw.trim().toUpperCase();
  const template = KNOWN_LEVELS[ticker] ?? {
    support: 'локальная поддержка по последним минимумам',
    resistance: 'локальное сопротивление по последним максимумам',
    trend: 'нейтральный до подтверждения объема и направления рынка',
  };

  return {
    ticker,
    trend: template.trend,
    levels: [template.support, template.resistance],
    entry: 'Вход только после подтверждения уровня: ретест, импульс с объемом или понятная свечная модель.',
    stop: 'Стоп за технический уровень, а не по случайному проценту; риск по сделке не выше заданного лимита.',
    takeProfit: 'Тейк минимум 1.5–2R, часть позиции можно фиксировать на первом сопротивлении.',
    risk: 'Если риск превышает 1–2% депозита или R/R ниже 1:1.5 — сделку лучше пропустить.',
    decision: 'Сделка разрешена только при подтверждении плана; без подтверждения лучше пропустить.',
  };
}

export function formatInstrumentAnalysis(analysis: InstrumentAnalysis): string {
  return `📈 <b>Анализ инструмента: ${analysis.ticker}</b>

• Тренд: <b>${analysis.trend}</b>
• Уровни:
  — ${analysis.levels.join('\n  — ')}
• Возможный вход: ${analysis.entry}
• Стоп: ${analysis.stop}
• Тейк: ${analysis.takeProfit}
• Риск: ${analysis.risk}
• Комментарий: <b>${analysis.decision}</b>

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function reviewTrade(input: BcsTradeInput, depositRub: number): string {
  const risk = calculateTradeRisk(input, depositRub);
  const problems: string[] = [];
  if (risk.riskPercentOfDeposit > 2) problems.push(`риск ${risk.riskPercentOfDeposit.toFixed(2)}% выше консервативного лимита 1–2%`);
  if (risk.riskReward < 1.5) problems.push(`Risk/Reward 1:${risk.riskReward.toFixed(2)} слабее минимального ориентира 1:1.5`);
  if (input.direction === 'LONG' && input.stopLoss >= input.entryPrice) problems.push('для LONG стоп должен быть ниже цены входа');
  if (input.direction === 'SHORT' && input.stopLoss <= input.entryPrice) problems.push('для SHORT стоп должен быть выше цены входа');

  const isGood = problems.length === 0;
  return `🧠 <b>AI-разбор сделки ${input.symbol}</b>

• Вход: ${isGood ? 'логически допустим при наличии технического сигнала' : 'требует доработки'}
• Риск-менеджмент: ${risk.riskPercentOfDeposit.toFixed(2)}% от депозита
• Стоп: ${problems.some(p => p.includes('стоп')) ? 'некорректный относительно направления' : 'формально корректный, проверьте что он стоит за уровнем'}
• Тейк: ${risk.riskReward >= 1.5 ? 'нормальный по R/R' : 'слишком близкий относительно риска'}
• Стоит ли входить: <b>${isGood ? 'можно рассматривать, если есть подтверждение уровня' : 'лучше пропустить до исправления плана'}</b>

${problems.length ? `<b>Что улучшить:</b>\n${problems.map(p => `• ${p}`).join('\n')}` : '<b>Что улучшить:</b>\n• Дождаться подтверждения объема/уровня и заранее прописать сценарий выхода.'}

⚠️ <i>Это не инвестиционная рекомендация. Решение принимает пользователь.</i>`;
}
