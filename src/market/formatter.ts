import { analyzeMarketState } from './state-engine';
import type { MarketInstrument, MarketSnapshot, ScannerAction, ScannerRisk, ScannerSignal, ScannerTrend, TopListMode } from './types';

export function formatMarketOverview(snapshot: MarketSnapshot, signals: ScannerSignal[], gainers: MarketInstrument[], losers: MarketInstrument[]): string {
  const index = findInstrument(snapshot, 'IMOEX');
  const usdRub = findInstrument(snapshot, 'Si');
  const brent = findInstrument(snapshot, 'BR');
  const gold = findInstrument(snapshot, 'GOLD');
  const marketState = analyzeMarketState({ snapshot, signals, gainers, losers, volume: [] });
  return `${fallbackNotice(snapshot)}📡 <b>РЫНОК · MOEX</b>

🧠 <b>AI MARKET STATUS</b>
${marketState.label}
Сессия: <b>${marketState.session.label}</b>
IMOEX: <b>${trendWord(index?.changePercent)}</b> ${formatChange(index?.changePercent)}
Oil: <b>${trendWord(brent?.changePercent)}</b> ${formatChange(brent?.changePercent)}
Volatility: <b>${volatilityWord(snapshot)}</b>

Вероятность роста IMOEX: <b>${growthProbability(index?.changePercent, marketState.breadth)}%</b>

📊 <b>Ключевые активы</b>
• IMOEX ${formatPrice(index)} · ${formatChange(index?.changePercent)}
• USD/RUB ${formatPrice(usdRub)} · ${formatChange(usdRub?.changePercent)}
• Brent ${formatPrice(brent)} · ${formatChange(brent?.changePercent)}
• Gold ${formatPrice(gold)} · ${formatChange(gold?.changePercent)}

🔥 <b>Сильные</b>
${formatCompactList(gainers)}

❄️ <b>Слабые</b>
${formatCompactList(losers)}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatScanner(snapshot: MarketSnapshot, signals: ScannerSignal[]): string {
  return `${fallbackNotice(snapshot)}📡 <b>AI MARKET SCANNER</b>

${signals.length ? signals.map(formatSignal).join('\n\n') : '⚪ Сигналов по разрешенным инструментам сейчас нет.'}

🧾 <b>Фильтр:</b> trend · momentum · liquidity · risk · комиссии БКС
⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatTopList(snapshot: MarketSnapshot, mode: TopListMode, instruments: MarketInstrument[]): string {
  const titles: Record<TopListMode, string> = {
    gainers: '🟢 <b>ТОП · Рост</b>',
    losers: '🔴 <b>ТОП · Снижение</b>',
    volume: '📊 <b>ТОП · Объем</b>',
  };
  return `${fallbackNotice(snapshot)}${titles[mode]}

${formatDetailedList(instruments)}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

function fallbackNotice(snapshot: MarketSnapshot): string {
  return snapshot.fallback ? '⚠️ MOEX API временно недоступен. Показываю cached/mock snapshot.\n\n' : '';
}

function formatSignal(signal: ScannerSignal): string {
  const badge = actionBadge(signal.action);
  const risk = riskBadge(signal.risk);
  return `${badge} <b>${signal.ticker} ${signal.action}</b>
Confidence: <b>${signal.confidence.toFixed(1)}/10</b>
Trend: <b>${trendLabel(signal.trend)}</b> · Momentum: <b>${signed(signal.momentum)}</b>
Risk: <b>${risk}</b> · Liquidity: <b>${signal.liquidityScore.toFixed(1)}/10</b>
Комиссия: <b>~${signal.commissionRub.toFixed(1)} ₽</b>
Причина: ${signal.reasons.slice(0, 2).join(' · ')}`;
}

function formatCompactList(instruments: MarketInstrument[]): string {
  return instruments.length ? instruments.slice(0, 4).map(item => `${changeEmoji(item.changePercent)} <b>${item.ticker}</b> ${formatChange(item.changePercent)} · ${formatVolume(item.volume)}`).join('\n') : 'нет данных';
}

function formatDetailedList(instruments: MarketInstrument[]): string {
  return instruments.length ? instruments.map((item, index) => `${index + 1}. ${changeEmoji(item.changePercent)} <b>${item.ticker}</b> ${formatPrice(item)} · ${formatChange(item.changePercent)} · ${formatVolume(item.volume)}`).join('\n') : 'нет данных';
}

function findInstrument(snapshot: MarketSnapshot, ticker: string): MarketInstrument | undefined {
  return snapshot.instruments.find(item => item.ticker.toUpperCase() === ticker.toUpperCase());
}

function formatPrice(item?: MarketInstrument): string {
  if (!item || item.lastPrice === null) return 'нет данных';
  return item.lastPrice.toLocaleString('ru-RU', { maximumFractionDigits: item.lastPrice < 1 ? 5 : 2 });
}

function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'нет данных';
  const sign = value > 0 ? '+' : '';
  return `<b>${sign}${value.toFixed(2)}%</b>`;
}

function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'нет данных';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

function actionBadge(action: ScannerAction): string {
  if (action === 'LONG') return '🟢';
  if (action === 'SHORT') return '🔴';
  if (action === 'WATCH') return '🟡';
  return '⚪';
}

function riskBadge(risk: ScannerRisk): string {
  if (risk === 'low') return 'низкий';
  if (risk === 'medium') return 'средний';
  return 'высокий';
}

function trendLabel(trend: ScannerTrend): string {
  if (trend === 'bullish') return 'bullish';
  if (trend === 'bearish') return 'bearish';
  return 'neutral';
}

function changeEmoji(value: number | null | undefined): string {
  if (value === null || value === undefined) return '⚪';
  if (value > 0.2) return '🟢';
  if (value < -0.2) return '🔴';
  return '⚪';
}

function trendWord(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'unknown';
  if (value > 0.4) return 'bullish';
  if (value < -0.4) return 'bearish';
  return 'neutral';
}

function volatilityWord(snapshot: MarketSnapshot): string {
  const values = snapshot.instruments.map(item => Math.abs(item.volatility ?? item.changePercent ?? 0));
  const max = Math.max(0, ...values);
  if (max >= 2.5) return 'high';
  if (max >= 1.2) return 'medium';
  return 'low';
}

function growthProbability(imoex: number | null | undefined, breadth: number): number {
  const base = 50 + (imoex ?? 0) * 12 + breadth * 22;
  return Math.max(15, Math.min(85, Math.round(base)));
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}
