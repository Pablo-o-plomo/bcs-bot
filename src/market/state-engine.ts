import { getTradingSession, type TradingSessionInfo } from './session';
import type { MarketInstrument, MarketSnapshot, ScannerSignal } from './types';

export type MarketStateCode = 'ACTIVE_BULL' | 'ACTIVE_BEAR' | 'SIDEWAYS' | 'DEAD_MARKET' | 'HIGH_VOLATILITY' | 'RISK_OFF';

export interface MarketStateInput {
  snapshot: MarketSnapshot;
  signals: ScannerSignal[];
  gainers: MarketInstrument[];
  losers: MarketInstrument[];
  volume: MarketInstrument[];
}

export interface MarketStateResult {
  code: MarketStateCode;
  label: string;
  riskLevel: 'низкий' | 'средний' | 'повышенный' | 'высокий';
  session: TradingSessionInfo;
  breadth: number;
  summary: string;
  scannerHighlights: string[];
}

export function analyzeMarketState(input: MarketStateInput): MarketStateResult {
  const session = getTradingSession();
  const imoex = find(input.snapshot.instruments, 'IMOEX')?.changePercent ?? 0;
  const brent = find(input.snapshot.instruments, 'BR')?.changePercent ?? 0;
  const usdRub = find(input.snapshot.instruments, 'SI')?.changePercent ?? 0;
  const changes = input.snapshot.instruments
    .filter(item => item.ticker.toUpperCase() !== 'IMOEX')
    .map(item => item.changePercent ?? 0);
  const positives = changes.filter(change => change > 0.2).length;
  const negatives = changes.filter(change => change < -0.2).length;
  const breadth = changes.length ? (positives - negatives) / changes.length : 0;
  const maxAbsChange = Math.max(0, ...changes.map(change => Math.abs(change)), Math.abs(imoex), Math.abs(brent), Math.abs(usdRub));
  const activeSignals = input.signals.length;

  let code: MarketStateCode = 'SIDEWAYS';
  if (maxAbsChange < 0.35 && activeSignals <= 1) code = 'DEAD_MARKET';
  else if (maxAbsChange >= 2.5 || activeSignals >= 6) code = 'HIGH_VOLATILITY';
  else if (imoex <= -1 || breadth < -0.35 || (usdRub > 1 && brent < -0.8)) code = 'RISK_OFF';
  else if (imoex > 0.7 && breadth > 0.2) code = 'ACTIVE_BULL';
  else if (imoex < -0.7 && breadth < -0.2) code = 'ACTIVE_BEAR';

  const labels: Record<MarketStateCode, string> = {
    ACTIVE_BULL: '🟢 Активный рост',
    ACTIVE_BEAR: '🔴 Активное снижение',
    SIDEWAYS: '🟡 Боковик',
    DEAD_MARKET: '😴 Мертвый рынок',
    HIGH_VOLATILITY: '⚡ Высокая волатильность',
    RISK_OFF: '⚠️ Risk-off режим',
  };

  const riskLevel = code === 'RISK_OFF' || code === 'HIGH_VOLATILITY'
    ? 'высокий'
    : code === 'ACTIVE_BEAR'
      ? 'повышенный'
      : code === 'DEAD_MARKET'
        ? 'средний'
        : 'средний';

  const scannerHighlights = input.signals.slice(0, 4).map(signal => `${signal.ticker} — ${signal.reasons[0] ?? 'scanner signal'}`);
  return {
    code,
    label: labels[code],
    riskLevel,
    session,
    breadth,
    summary: buildSummary(code, session.label),
    scannerHighlights,
  };
}

function buildSummary(code: MarketStateCode, sessionLabel: string): string {
  if (code === 'ACTIVE_BULL') return `Сейчас рынок активный (${sessionLabel}). Подходит для intraday-наблюдения, но входы только после подтверждения объема и уровня.`;
  if (code === 'ACTIVE_BEAR') return `Рынок под давлением (${sessionLabel}). Лучше снижать риск и ждать подтверждения разворота.`;
  if (code === 'HIGH_VOLATILITY') return `Волатильность повышена (${sessionLabel}). Размер позиции и стоп должны быть консервативными.`;
  if (code === 'RISK_OFF') return `Risk-off фон (${sessionLabel}). Приоритет — защита капитала и paper-сценарии.`;
  if (code === 'DEAD_MARKET') return `Активность низкая (${sessionLabel}). Лучше тестировать scanner и не форсировать сделки.`;
  return `Рынок без явного тренда (${sessionLabel}). Нужны подтверждения по объему и направлению индекса.`;
}

function find(items: MarketInstrument[], ticker: string): MarketInstrument | undefined {
  return items.find(item => item.ticker.toUpperCase() === ticker.toUpperCase());
}
