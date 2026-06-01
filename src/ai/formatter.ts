import type { AiDealContext, AiMarketContext, AiPortfolioContext, AiRiskContext } from './types';

export function formatPortfolioFallback(ctx: AiPortfolioContext): string {
  const cashRub = ctx.cash.reduce((sum, item) => sum + (item.currentValueRub ?? (item.currency === 'RUB' ? item.total : 0)), 0) || ctx.freeCash;
  const cashShare = ctx.balance > 0 ? (cashRub / ctx.balance) * 100 : 0;
  const positionsText = ctx.positions.length
    ? ctx.positions.slice(0, 6).map(position => `• <b>${position.ticker}</b>: ${formatRub(position.currentValueRub ?? position.currentPrice * position.quantity)} / P&L ${formatRub(position.unrealizedPL ?? position.unrealizedPnl)}`).join('\n')
    : `В портфеле сейчас только денежный остаток. Анализирую готовность к торговле.`;
  const depositGap = ctx.settings.depositRub > 0 && cashRub < ctx.settings.depositRub * 0.1
    ? 'Фактический остаток сильно ниже планового депозита. Торговать реальным объемом сейчас нельзя.'
    : 'Фактический остаток сопоставим с настройками, но размер риска нужно проверять перед каждой сделкой.';
  return `🧠 <b>AI-разбор портфеля</b>

<b>Состояние:</b>
${ctx.source.startsWith('⚠️') ? `${ctx.source}\n` : ''}${positionsText}

Кэш: <b>${formatRub(cashRub)}</b>
Доля кэша: <b>${cashShare.toFixed(1)}%</b>
Дневной P&L: <b>${formatRub(ctx.dayPnl)}</b>
Общий P&L: <b>${formatRub(ctx.totalPnl)}</b>

<b>Риск:</b>
Депозит в настройках: <b>${formatRub(ctx.settings.depositRub)}</b>
Риск на сделку: <b>${ctx.settings.riskPerTrade.toFixed(2)}%</b>
${depositGap}

<b>Вывод:</b>
Режим: <b>наблюдение / paper mode</b>.
Лучший следующий шаг: тестировать scanner, дневник сделок и условия входа без реальных ордеров.

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatMarketFallback(ctx: AiMarketContext): string {
  const index = ctx.snapshot.instruments.find(item => item.ticker.toUpperCase() === 'IMOEX');
  const brent = ctx.snapshot.instruments.find(item => item.ticker.toUpperCase() === 'BR');
  const usd = ctx.snapshot.instruments.find(item => item.ticker.toUpperCase() === 'SI');
  return `🧠 <b>AI-сводка рынка</b>

<b>Фон:</b>
Рынок: <b>${ctx.snapshot.status === 'open' ? 'открыт' : ctx.snapshot.status === 'closed' ? 'закрыт' : 'неизвестно'}</b>
IMOEX: <b>${formatChange(index?.changePercent)}</b>
Brent: <b>${formatChange(brent?.changePercent)}</b>
USD/RUB: <b>${formatChange(usd?.changePercent)}</b>

🔥 <b>Сильные бумаги:</b>
${ctx.gainers.slice(0, 3).map(item => `• ${item.ticker}: ${formatChange(item.changePercent)}`).join('\n') || 'нет данных'}

❄️ <b>Слабые бумаги:</b>
${ctx.losers.slice(0, 3).map(item => `• ${item.ticker}: ${formatChange(item.changePercent)}`).join('\n') || 'нет данных'}

<b>Сценарий:</b>
Смотреть не на один тикер, а на подтверждение: индекс, объем, импульс и риск на сделку. Если сигнал только по цене без объема — лучше ждать подтверждения.

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatRiskFallback(ctx: AiRiskContext): string {
  const maxRiskRub = ctx.settings.depositRub * (ctx.settings.riskPerTrade / 100);
  const exposureShare = ctx.settings.depositRub > 0 ? (ctx.exposureRub / ctx.settings.depositRub) * 100 : 0;
  return `🧠 <b>AI-риск</b>

<b>Настройки:</b>
Депозит: <b>${formatRub(ctx.settings.depositRub)}</b>
Риск на сделку: <b>${ctx.settings.riskPerTrade.toFixed(2)}%</b> ≈ <b>${formatRub(maxRiskRub)}</b>
Дневная просадка: <b>${ctx.settings.maxDailyLoss.toFixed(2)}%</b>
Макс. позиций: <b>${ctx.settings.maxOpenPositions}</b>

<b>Текущий exposure:</b>
Позиции: <b>${ctx.positionsCount}</b>
Exposure: <b>${formatRub(ctx.exposureRub)}</b> / <b>${exposureShare.toFixed(1)}%</b> от депозита
Кэш: <b>${formatRub(ctx.cashRub)}</b>

<b>Execution:</b>
Paper mode: <b>${ctx.paperMode ? 'да' : 'нет'}</b>
Execution mode: <b>${ctx.executionMode}</b>
Read only: <b>${ctx.readOnly ? 'true' : 'false'}</b>
Order execution: <b>${ctx.orderExecution ? 'true' : 'false'}</b>

<b>Вывод:</b>
Фокус — контроль размера позиции, стоп до входа и лимит дневного риска. При сомнительном рынке лучше ждать подтверждения.

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatDealFallback(ctx: AiDealContext): string {
  const change = ctx.instrument?.changePercent ?? 0;
  const riskRub = ctx.settings.depositRub * (ctx.settings.riskPerTrade / 100);
  const directionText = ctx.direction === 'long' ? 'long-сценарий' : 'short-сценарий';
  const context = Math.abs(change) >= 1.5 ? 'есть импульс, но нужно проверить объем и уровень' : 'импульс слабый, лучше ждать подтверждения';
  return `🧠 <b>AI-разбор сделки</b>

Инструмент: <b>${ctx.ticker}</b>
Направление: <b>${directionText}</b>
Рынок: <b>${ctx.marketStatus}</b>
Изменение: <b>${formatChange(ctx.instrument?.changePercent)}</b>
Объем: <b>${formatVolume(ctx.instrument?.volume)}</b>

<b>Контекст:</b>
${context}.

<b>Риск:</b>
Лимит риска по настройкам: <b>${formatRub(riskRub)}</b> на сценарий.
Стоп нужно ставить за технический уровень, а размер позиции считать от расстояния до стопа.

<b>Что проверить:</b>
• подтверждение уровня
• объем относительно обычного
• RR не ниже 1:1.5
• отсутствие входа на эмоциях

<b>Вывод:</b>
Без подтверждения лучше ждать. Сценарий можно вести в paper mode и дневнике сделок.

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

function formatRub(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'нет данных';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'нет данных';
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}
