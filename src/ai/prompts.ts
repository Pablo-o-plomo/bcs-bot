import type { AiDealContext, AiMarketContext, AiPortfolioContext, AiRiskContext } from './types';

const SAFETY = 'Не давай прямых инвестиционных рекомендаций, не используй слова покупай/продавай. Используй формулировки: сценарий, риск, условия входа, что проверить, лучше ждать подтверждения. Всегда добавь дисклеймер: Это не инвестиционная рекомендация.';

export function portfolioPrompt(ctx: AiPortfolioContext): string {
  return `${SAFETY}\nСделай краткий HTML-разбор портфеля БКС. Контекст: ${JSON.stringify(ctx)}`;
}

export function marketPrompt(ctx: AiMarketContext): string {
  return `${SAFETY}\nСделай краткую HTML AI-сводку рынка MOEX. Контекст: ${JSON.stringify(ctx)}`;
}

export function riskPrompt(ctx: AiRiskContext): string {
  return `${SAFETY}\nСделай краткий HTML risk-разбор по настройкам и exposure. Контекст: ${JSON.stringify(ctx)}`;
}

export function dealPrompt(ctx: AiDealContext): string {
  return `${SAFETY}\nРазбери сценарий сделки в HTML: рыночный контекст, риск, примерный стоп, размер позиции, почему лучше ждать подтверждения или пропустить при слабых условиях. Контекст: ${JSON.stringify(ctx)}`;
}
