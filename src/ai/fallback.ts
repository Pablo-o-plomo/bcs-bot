import { analyzeMarketState } from '../market/state-engine';
import type { AiDealContext, AiMarketContext, AiPortfolioContext, AiRiskContext } from './types';
import { formatDealFallback, formatPortfolioFallback, formatRiskFallback } from './formatter';

export function fallbackPortfolioAnalysis(ctx: AiPortfolioContext, market?: AiMarketContext): string {
  const base = formatPortfolioFallback(ctx);
  if (!market) return base;
  const state = market.state ?? analyzeMarketState(market);
  return `${base}

<b>Состояние рынка:</b>
${state.label}
Сессия: <b>${state.session.label}</b>
Риск рынка: <b>${state.riskLevel}</b>

<b>Scanner:</b>
${state.scannerHighlights.length ? state.scannerHighlights.map(item => `• ${item}`).join('\n') : 'активных сигналов мало'}

<b>Готовность:</b>
Если портфель состоит только из кэша, базовый режим — наблюдение, тестовый режим и проверка scanner-сценариев.`;
}

export function fallbackMarketAnalysis(ctx: AiMarketContext): string {
  const state = ctx.state ?? analyzeMarketState(ctx);
  const imoex = ctx.snapshot.instruments.find(item => item.ticker.toUpperCase() === 'IMOEX');
  const brent = ctx.snapshot.instruments.find(item => item.ticker.toUpperCase() === 'BR');
  const usd = ctx.snapshot.instruments.find(item => item.ticker.toUpperCase() === 'SI');
  return `🧠 <b>AI Market State</b>

<b>Состояние:</b>
${state.label}

<b>Сессия:</b>
${state.session.label}

<b>IMOEX:</b>
${formatChange(imoex?.changePercent)}

<b>Нефть:</b>
Brent ${formatChange(brent?.changePercent)}

<b>USD/RUB:</b>
${formatChange(usd?.changePercent)}

<b>Риск:</b>
${state.riskLevel}

<b>Scanner:</b>
${state.scannerHighlights.length ? state.scannerHighlights.map(item => `• ${item}`).join('\n') : 'активных сигналов мало'}

<b>Вывод:</b>
${state.summary}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function fallbackRiskAnalysis(ctx: AiRiskContext, market?: AiMarketContext): string {
  const base = formatRiskFallback(ctx);
  if (!market) return base;
  const state = market.state ?? analyzeMarketState(market);
  return `${base}

<b>Market State:</b>
${state.label}
Сессия: <b>${state.session.label}</b>
Рыночный риск: <b>${state.riskLevel}</b>`;
}

export function fallbackDealAnalysis(ctx: AiDealContext): string {
  const base = formatDealFallback(ctx);
  return ctx.marketState ? `${base}

<b>Market State:</b>
${ctx.marketState.label}
Сессия: <b>${ctx.marketState.session.label}</b>
Риск рынка: <b>${ctx.marketState.riskLevel}</b>` : base;
}

function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'нет данных';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
