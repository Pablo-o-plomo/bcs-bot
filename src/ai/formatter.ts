import type { AiDealContext, AiMarketContext, AiPortfolioContext, AiRiskContext } from './types';

const LEGACY_TEST_CAPITAL = 300000;

function plannedCapital(value: number): number | null {
  return value > 0 && value !== LEGACY_TEST_CAPITAL ? value : null;
}

function plannedCapitalText(value: number): string {
  const planned = plannedCapital(value);
  return planned === null ? 'Плановый капитал не задан' : formatRub(planned);
}

export function formatPortfolioFallback(ctx: AiPortfolioContext): string {
  const cashRub = ctx.cash.reduce((sum, item) => sum + (item.currentValueRub ?? (item.currency === 'RUB' ? item.total : 0)), 0) || ctx.freeCash;
  const cashShare = ctx.balance > 0 ? (cashRub / ctx.balance) * 100 : 0;
  const positionsText = ctx.positions.length
    ? ctx.positions.slice(0, 6).map(position => `• <b>${position.ticker}</b>: ${formatRub(position.currentValueRub ?? position.currentPrice * position.quantity)} / P&L ${formatRub(position.unrealizedPL ?? position.unrealizedPnl)}`).join('\n')
    : `В портфеле сейчас только денежный остаток. Анализирую готовность к торговле.`;
  const planned = plannedCapital(ctx.settings.depositRub);
  const capitalNote = cashRub > 0 && cashRub < 1000
    ? 'Фактический остаток небольшой. Реальную торговлю лучше не начинать. Сначала проверьте аналитику, рынок и журнал сделок.'
    : planned === null
      ? 'Плановый капитал не задан. Оценка строится по фактическим данным БКС.'
      : 'Плановый капитал задан. Размер риска нужно сверять с фактическим остатком и стоимостью портфеля.';
  return `🧠 <b>AI-разбор портфеля</b>

<b>Состояние:</b>
${ctx.source.startsWith('⚠️') ? `${ctx.source}\n` : ''}${positionsText}

Кэш: <b>${formatRub(cashRub)}</b>
Доля кэша: <b>${cashShare.toFixed(1)}%</b>
Дневной P&L: <b>${formatRub(ctx.dayPnl)}</b>
Общий P&L: <b>${formatRub(ctx.totalPnl)}</b>

<b>Риск:</b>
Плановый капитал: <b>${plannedCapitalText(ctx.settings.depositRub)}</b>
Риск на сделку: <b>${ctx.settings.riskPerTrade.toFixed(2)}%</b>
${capitalNote}

<b>Вывод:</b>
Режим: <b>наблюдение / тестовый режим</b>.
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
  const planned = plannedCapital(ctx.settings.depositRub);
  const currentCapital = ctx.cashRub + ctx.exposureRub;
  const riskBase = planned ?? currentCapital;
  const maxRiskRub = riskBase * (ctx.settings.riskPerTrade / 100);
  const exposureShare = currentCapital > 0 ? (ctx.exposureRub / currentCapital) * 100 : 0;
  return `🧠 <b>AI-риск</b>

<b>Настройки:</b>
Плановый капитал: <b>${plannedCapitalText(ctx.settings.depositRub)}</b>
Текущий капитал: <b>${formatRub(currentCapital)}</b>
Риск на сделку: <b>${ctx.settings.riskPerTrade.toFixed(2)}%</b>${riskBase > 0 ? ` ≈ <b>${formatRub(maxRiskRub)}</b>` : ''}
Дневной лимит убытка: <b>${ctx.settings.maxDailyLoss.toFixed(2)}%</b>
Максимум позиций: <b>${ctx.settings.maxOpenPositions}</b>

<b>Текущий объем в позициях:</b>
Позиции: <b>${ctx.positionsCount}</b>
Объем в позициях: <b>${formatRub(ctx.exposureRub)}</b> / <b>${exposureShare.toFixed(1)}%</b> от текущего капитала
Кэш: <b>${formatRub(ctx.cashRub)}</b>

<b>Безопасность:</b>
Тестовый режим: <b>${ctx.paperMode ? 'включен' : 'выключен'}</b>
Режим заявок: <b>${ctx.executionMode === 'manual_confirm' ? 'Ручное подтверждение' : ctx.executionMode}</b>
Только просмотр: <b>${ctx.readOnly ? 'да' : 'нет'}</b>
Заявки: <b>${ctx.orderExecution ? 'включены' : 'отключены'}</b>

<b>Вывод:</b>
Фокус — контроль размера позиции, стоп до входа и лимит дневного риска. При сомнительном рынке лучше ждать подтверждения.

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

export function formatDealFallback(ctx: AiDealContext): string {
  const change = ctx.instrument?.changePercent ?? 0;
  const planned = plannedCapital(ctx.settings.depositRub);
  const riskRub = (planned ?? 0) * (ctx.settings.riskPerTrade / 100);
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
Лимит риска: <b>${planned ? formatRub(riskRub) : 'Плановый капитал не задан'}</b> на сценарий.
Стоп нужно ставить за технический уровень, а размер позиции считать от расстояния до стопа.

<b>Что проверить:</b>
• подтверждение уровня
• объем относительно обычного
• RR не ниже 1:1.5
• отсутствие входа на эмоциях

<b>Вывод:</b>
Без подтверждения лучше ждать. Сценарий можно вести в тестовом режиме и дневнике сделок.

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
