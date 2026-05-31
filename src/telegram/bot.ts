import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { logger } from '../utils/logger';
import { BUILD_VERSION } from '../version';
import { getMainKeyboard, handleAdminCallback, setAdminCommandHandler } from './adminMenu';
import { calculateTradeRisk, formatRiskCalculation } from '../bcs/risk';
import { getBcsCommissionSummary } from '../bcs/commission_bcs';
import { analyzeInstrument, formatInstrumentAnalysis, reviewTrade } from '../bcs/analysis';
import {
  ensureUser,
  getInstruments,
  getLastNTrades,
  getMonthTrades,
  getOpenTrades,
  getTodayTrades,
  getTradeById,
  getUserSettings,
  getWinrateBySymbol,
  saveAiReview,
  saveBcsTrade,
  updateUserSettings,
} from '../database/db';
import type { BcsTradeInput, Direction, InstrumentType, RiskCalculation, Trade } from '../database/models';

let bot: TelegramBot;

interface DraftTrade {
  step: 'instrument' | 'instrumentType' | 'direction' | 'entryPrice' | 'quantity' | 'stopLoss' | 'takeProfit' | 'commission' | 'comment';
  data: Partial<BcsTradeInput>;
}

const drafts = new Map<string, DraftTrade>();
const textModes = new Map<string, 'instrument_analysis' | 'ai_review' | 'set_deposit' | 'set_risk'>();

export function initTelegramBot(): TelegramBot {
  if (!config.telegram.botToken) {
    throw new Error('Missing BOT_TOKEN (or TELEGRAM_BOT_TOKEN)');
  }

  bot = new TelegramBot(config.telegram.botToken, { polling: true });
  setAdminCommandHandler(handleCommand);
  registerCommands();
  logger.info(`🤖 BCS Trading Assistant started. Build: ${BUILD_VERSION}`);
  return bot;
}

export function getBot(): TelegramBot {
  if (!bot) throw new Error('Telegram bot not initialized');
  return bot;
}

function registerCommands(): void {
  bot.onText(/^\/start(?:@\w+)?(?:\s|$)/, async msg => handleStart(msg));
  bot.onText(/^\/menu(?:@\w+)?(?:\s|$)/, async msg => handleStart(msg));
  bot.onText(/^\/portfolio/, async msg => handleCommand(chatId(msg), '/portfolio', fromId(msg)));
  bot.onText(/^\/add_trade/, async msg => handleCommand(chatId(msg), '/add_trade', fromId(msg)));
  bot.onText(/^\/analyze(?:\s+(.+))?/, async (msg, match) => handleAnalyzeCommand(msg, match?.[1]));
  bot.onText(/^Разбери сделку(?:\s+(.+))?/i, async (msg, match) => handleAiReviewCommand(msg, match?.[1]));
  bot.onText(/^\/ai_review/, async msg => handleCommand(chatId(msg), '/ai_review', fromId(msg)));
  bot.onText(/^\/risk/, async msg => handleCommand(chatId(msg), '/risk', fromId(msg)));
  bot.onText(/^\/commissions/, async msg => handleCommand(chatId(msg), '/commissions', fromId(msg)));
  bot.onText(/^\/diary/, async msg => handleCommand(chatId(msg), '/diary', fromId(msg)));
  bot.onText(/^\/daily_report/, async msg => handleCommand(chatId(msg), '/daily_report', fromId(msg)));
  bot.onText(/^\/monthly_report/, async msg => handleCommand(chatId(msg), '/monthly_report', fromId(msg)));
  bot.onText(/^\/settings/, async msg => handleCommand(chatId(msg), '/settings', fromId(msg)));
  bot.onText(/^\/trade(?:\s+(\d+))?/, async (msg, match) => handleTradeDetails(chatId(msg), Number(match?.[1])));

  bot.on('callback_query', async query => {
    try {
      if (query.data?.startsWith('draft:')) {
        await bot.answerCallbackQuery(query.id, { text: 'OK' });
        await handleDraftCallback(query);
        return;
      }
      if (query.data?.startsWith('settings:')) {
        await bot.answerCallbackQuery(query.id, { text: 'OK' });
        await handleSettingsCallback(query);
        return;
      }
      await handleAdminCallback(bot, query);
    } catch (err: any) {
      logger.error(`Callback error: ${err.message}`);
      await bot.answerCallbackQuery(query.id, { text: 'Ошибка' }).catch(() => undefined);
    }
  });

  bot.on('message', async msg => {
    if (!msg.text || msg.text.startsWith('/') || /^Разбери сделку/i.test(msg.text)) return;
    const id = fromId(msg);
    ensureUser(id, msg.from?.username);
    if (drafts.has(id)) {
      await handleDraftText(msg);
      return;
    }
    const mode = textModes.get(id);
    if (mode) {
      await handleTextMode(msg, mode);
    }
  });

  bot.on('polling_error', err => logger.error(`Telegram polling error: ${err.message}`));
}

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  const id = fromId(msg);
  ensureUser(id, msg.from?.username);
  await bot.sendMessage(msg.chat.id, `🤖 <b>BCS Trading Assistant</b>

Бот для аналитики, дневника сделок, расчетов риска и сопровождения торговли через БКС.

⚠️ <i>Это не инвестиционная рекомендация. Бот не совершает сделки автоматически — все решения принимает пользователь.</i>`, {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(),
  });
}

async function handleCommand(chatIdValue: string, command: string, userId = chatIdValue): Promise<void> {
  ensureUser(userId);
  if (command === '/portfolio') return send(chatIdValue, buildPortfolio(userId));
  if (command === '/add_trade') return startAddTrade(chatIdValue, userId);
  if (command === '/analyze_instrument') return requestInstrument(chatIdValue, userId);
  if (command === '/ai_review') return requestAiReview(chatIdValue, userId);
  if (command === '/risk') return send(chatIdValue, buildRiskManagement(userId));
  if (command === '/commissions') return send(chatIdValue, getBcsCommissionSummary());
  if (command === '/diary') return send(chatIdValue, buildDiary(userId));
  if (command === '/daily_report') return send(chatIdValue, buildPeriodReport(userId, 'day'));
  if (command === '/monthly_report') return send(chatIdValue, buildPeriodReport(userId, 'month'));
  if (command === '/settings') return sendSettings(chatIdValue, userId);
  return send(chatIdValue, 'Раздел в разработке.');
}

async function startAddTrade(chatIdValue: string, userId: string): Promise<void> {
  drafts.set(userId, { step: 'instrument', data: { telegramId: userId } });
  await bot.sendMessage(chatIdValue, '📝 Выберите инструмент или отправьте тикер текстом:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'SBER', callback_data: 'draft:instrument:SBER' }, { text: 'GAZP', callback_data: 'draft:instrument:GAZP' }, { text: 'LKOH', callback_data: 'draft:instrument:LKOH' }],
        [{ text: 'IMOEX', callback_data: 'draft:instrument:IMOEX' }, { text: 'Si', callback_data: 'draft:instrument:Si' }, { text: 'BR', callback_data: 'draft:instrument:BR' }],
        [{ text: 'GOLD', callback_data: 'draft:instrument:GOLD' }],
      ],
    },
  });
}

async function handleDraftCallback(query: TelegramBot.CallbackQuery): Promise<void> {
  const id = query.from.id.toString();
  const chat = query.message?.chat.id.toString() ?? id;
  const [, field, value] = query.data?.split(':') ?? [];
  const draft = drafts.get(id);
  if (!draft) return startAddTrade(chat, id);

  if (field === 'instrument') {
    draft.data.symbol = value;
    draft.step = 'instrumentType';
    await askInstrumentType(chat);
  } else if (field === 'type') {
    draft.data.instrumentType = value as InstrumentType;
    draft.step = 'direction';
    await askDirection(chat);
  } else if (field === 'direction') {
    draft.data.direction = value as Direction;
    draft.step = 'entryPrice';
    await send(chat, 'Введите цену входа:');
  } else if (field === 'commission') {
    draft.data.commissionRub = value === 'auto' ? undefined : Number(value);
    draft.step = 'comment';
    await send(chat, 'Добавьте комментарий к сделке или отправьте «-»:');
  }
  drafts.set(id, draft);
}

async function handleDraftText(msg: TelegramBot.Message): Promise<void> {
  const id = fromId(msg);
  const chat = chatId(msg);
  const draft = drafts.get(id);
  if (!draft || !msg.text) return;
  const text = msg.text.trim();

  if (draft.step === 'instrument') {
    draft.data.symbol = text.toUpperCase();
    draft.step = 'instrumentType';
    drafts.set(id, draft);
    return askInstrumentType(chat);
  }

  if (draft.step === 'entryPrice') {
    const value = parseNumber(text);
    if (!value) return send(chat, 'Введите корректную цену входа числом.');
    draft.data.entryPrice = value;
    draft.step = 'quantity';
    drafts.set(id, draft);
    return send(chat, 'Введите количество:');
  }

  if (draft.step === 'quantity') {
    const value = parseNumber(text);
    if (!value) return send(chat, 'Введите корректное количество числом.');
    draft.data.quantity = value;
    draft.step = 'stopLoss';
    drafts.set(id, draft);
    return send(chat, 'Введите стоп-лосс:');
  }

  if (draft.step === 'stopLoss') {
    const value = parseNumber(text);
    if (!value) return send(chat, 'Введите корректный стоп-лосс числом.');
    draft.data.stopLoss = value;
    draft.step = 'takeProfit';
    drafts.set(id, draft);
    return send(chat, 'Введите тейк-профит:');
  }

  if (draft.step === 'takeProfit') {
    const value = parseNumber(text);
    if (!value) return send(chat, 'Введите корректный тейк-профит числом.');
    draft.data.takeProfit = value;
    draft.step = 'commission';
    drafts.set(id, draft);
    return bot.sendMessage(chat, 'Введите комиссию в ₽ или выберите авторасчет:', {
      reply_markup: { inline_keyboard: [[{ text: 'Авторасчет комиссии БКС', callback_data: 'draft:commission:auto' }]] },
    });
  }

  if (draft.step === 'commission') {
    const value = parseNumber(text);
    if (value === null) return send(chat, 'Введите комиссию числом или нажмите авторасчет.');
    draft.data.commissionRub = value;
    draft.step = 'comment';
    drafts.set(id, draft);
    return send(chat, 'Добавьте комментарий к сделке или отправьте «-»:');
  }

  if (draft.step === 'comment') {
    draft.data.comment = text === '-' ? '' : text;
    await finishDraft(chat, id, draft);
  }
}

async function finishDraft(chatIdValue: string, userId: string, draft: DraftTrade): Promise<void> {
  const input = draft.data as BcsTradeInput;
  const settings = getUserSettings(userId);
  const risk = calculateTradeRisk(input, settings.depositRub);
  const tradeId = saveBcsTrade(input, risk);
  drafts.delete(userId);
  await send(chatIdValue, `✅ <b>Сделка #${tradeId} добавлена</b>

${input.symbol} ${input.direction}
Тип: ${typeLabel(input.instrumentType)}
Вход: ${input.entryPrice}
Количество: ${input.quantity}
Стоп: ${input.stopLoss}
Тейк: ${input.takeProfit}

${formatRiskCalculation(risk)}

⚠️ <i>Это не инвестиционная рекомендация.</i>`);
}

async function askInstrumentType(chatIdValue: string): Promise<void> {
  await bot.sendMessage(chatIdValue, 'Выберите тип инструмента:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Акция РФ', callback_data: 'draft:type:stock' }, { text: 'Фьючерс MOEX', callback_data: 'draft:type:future' }],
        [{ text: 'Валюта', callback_data: 'draft:type:currency' }, { text: 'Облигация', callback_data: 'draft:type:bond' }],
        [{ text: 'Фонд', callback_data: 'draft:type:fund' }],
      ],
    },
  });
}

async function askDirection(chatIdValue: string): Promise<void> {
  await bot.sendMessage(chatIdValue, 'Выберите направление:', {
    reply_markup: { inline_keyboard: [[{ text: 'LONG', callback_data: 'draft:direction:LONG' }, { text: 'SHORT', callback_data: 'draft:direction:SHORT' }]] },
  });
}

async function requestInstrument(chatIdValue: string, userId: string): Promise<void> {
  textModes.set(userId, 'instrument_analysis');
  await send(chatIdValue, 'Введите тикер для анализа, например: SBER, GAZP, LKOH, IMOEX, Si, BR, GOLD.');
}

async function requestAiReview(chatIdValue: string, userId: string): Promise<void> {
  textModes.set(userId, 'ai_review');
  await send(chatIdValue, 'Отправьте описание сделки в формате: SBER stock LONG 270 10 260 290 5 комментарий. Или начните с фразы «Разбери сделку ...».');
}

async function handleAnalyzeCommand(msg: TelegramBot.Message, ticker?: string): Promise<void> {
  const id = fromId(msg);
  ensureUser(id, msg.from?.username);
  if (!ticker) return requestInstrument(chatId(msg), id);
  await send(chatId(msg), formatInstrumentAnalysis(analyzeInstrument(ticker)));
}

async function handleAiReviewCommand(msg: TelegramBot.Message, payload?: string): Promise<void> {
  const id = fromId(msg);
  ensureUser(id, msg.from?.username);
  if (!payload) return requestAiReview(chatId(msg), id);
  await processAiReview(chatId(msg), id, payload);
}

async function handleTextMode(msg: TelegramBot.Message, mode: 'instrument_analysis' | 'ai_review' | 'set_deposit' | 'set_risk'): Promise<void> {
  const id = fromId(msg);
  const chat = chatId(msg);
  textModes.delete(id);
  const text = msg.text?.trim() ?? '';
  if (mode === 'instrument_analysis') return send(chat, formatInstrumentAnalysis(analyzeInstrument(text)));
  if (mode === 'ai_review') return processAiReview(chat, id, text);
  if (mode === 'set_deposit') {
    const value = parseNumber(text);
    if (!value) return send(chat, 'Депозит не изменен: нужно положительное число.');
    updateUserSettings(id, { depositRub: value });
    return send(chat, `✅ Депозит обновлен: ${value.toFixed(2)} ₽`);
  }
  const value = parseNumber(text);
  if (!value) return send(chat, 'Риск не изменен: нужно положительное число.');
  updateUserSettings(id, { riskPerTradePercent: value });
  return send(chat, `✅ Риск на сделку обновлен: ${value.toFixed(2)}%`);
}

async function processAiReview(chatIdValue: string, userId: string, text: string): Promise<void> {
  const parsed = parseTradeLine(userId, text);
  const settings = getUserSettings(userId);
  const review = parsed
    ? reviewTrade(parsed, settings.depositRub)
    : `🧠 <b>AI-разбор сделки</b>

Не удалось распознать все числовые параметры, поэтому разбор общий:
• Проверьте, что вход идет от уровня, а не в середине диапазона.
• Риск на сделку должен быть не выше ${settings.riskPerTradePercent}% депозита.
• Стоп должен стоять за техническим уровнем.
• Тейк желательно не хуже 1:1.5–1:2 по Risk/Reward.
• Если нет понятного сценария выхода — лучше пропустить.

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
  saveAiReview({ telegramId: userId, requestText: text, reviewText: review });
  await send(chatIdValue, review);
}

function buildPortfolio(userId: string): string {
  const settings = getUserSettings(userId);
  const open = getOpenTrades(userId);
  const closed = getLastNTrades(200, userId);
  const pnl = closed.reduce((sum, trade) => sum + (trade.pnlRub ?? 0), 0);
  const fees = [...open, ...closed].reduce((sum, trade) => sum + (trade.commissionRub ?? 0), 0);
  return `📊 <b>Портфель</b>

Депозит: <b>${settings.depositRub.toFixed(2)} ₽</b>
Открытые позиции: <b>${open.length}</b>
Закрытые сделки: <b>${closed.length}</b>
P&L закрытых сделок: <b>${formatRub(pnl)}</b>
Комиссии: <b>${fees.toFixed(2)} ₽</b>

${open.length ? open.map(formatPositionLine).join('\n') : 'Открытых позиций нет.'}`;
}

function buildRiskManagement(userId: string): string {
  const settings = getUserSettings(userId);
  const maxRiskRub = settings.depositRub * (settings.riskPerTradePercent / 100);
  return `⚠️ <b>Риск-менеджмент</b>

Депозит: <b>${settings.depositRub.toFixed(2)} ₽</b>
Риск на сделку: <b>${settings.riskPerTradePercent.toFixed(2)}%</b>
Максимальный риск в ₽: <b>${maxRiskRub.toFixed(2)} ₽</b>
Дневной лимит: <b>${config.trading.maxDailyLoss}%</b>
Максимум открытых позиций: <b>${config.trading.maxOpenPositions}</b>

Правило: если сделка превышает лимит риска или R/R ниже 1:1.5 — лучше пропустить.`;
}

function buildDiary(userId: string): string {
  const trades = [...getOpenTrades(userId), ...getLastNTrades(10, userId)];
  if (!trades.length) return '📋 Дневник сделок пуст. Добавьте первую сделку через меню.';
  return `📋 <b>Дневник сделок</b>

${trades.slice(0, 15).map(formatTradeLine).join('\n')}`;
}

function buildPeriodReport(userId: string, period: 'day' | 'month'): string {
  const settings = getUserSettings(userId);
  const trades = period === 'day' ? getTodayTrades(userId) : getMonthTrades(userId);
  const open = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => t.result === 'win' || (t.pnlRub ?? 0) > 0);
  const losses = closed.filter(t => t.result === 'loss' || (t.pnlRub ?? 0) < 0);
  const pnl = closed.reduce((sum, t) => sum + (t.pnlRub ?? 0), 0);
  const fees = trades.reduce((sum, t) => sum + (t.commissionRub ?? 0), 0);
  const winrate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const best = [...closed].sort((a, b) => (b.pnlRub ?? 0) - (a.pnlRub ?? 0)).slice(0, 3);
  const worst = [...closed].sort((a, b) => (a.pnlRub ?? 0) - (b.pnlRub ?? 0)).slice(0, 3);
  const avgRisk = trades.length ? trades.reduce((sum, t) => sum + (t.riskPercent ?? 0), 0) / trades.length : 0;
  const bySymbol = getWinrateBySymbol(userId);

  return `${period === 'day' ? '📅 <b>Отчет за день</b>' : '📆 <b>Отчет за месяц</b>'}

Депозит: <b>${settings.depositRub.toFixed(2)} ₽</b>
Открытые позиции: <b>${open.length}</b>
Закрытые сделки: <b>${closed.length}</b>
P&L: <b>${formatRub(pnl)}</b>
Комиссии: <b>${fees.toFixed(2)} ₽</b>
Winrate: <b>${winrate.toFixed(1)}%</b>
${period === 'month' ? `Средний риск: <b>${avgRisk.toFixed(2)}%</b>\nЛучшие инструменты: ${bySymbol.slice(0, 3).map(x => x.symbol).join(', ') || 'нет данных'}\nХудшие инструменты: ${bySymbol.slice(-3).map(x => x.symbol).join(', ') || 'нет данных'}\nОшибки: превышение риска, слабый R/R, вход без подтверждения — отмечайте в комментариях.\nРекомендации: держать риск постоянным, не усреднять убытки, фиксировать причины входа.` : ''}

Лучшие сделки:
${best.length ? best.map(formatTradeLine).join('\n') : 'нет данных'}

Худшие сделки:
${worst.length ? worst.map(formatTradeLine).join('\n') : 'нет данных'}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

async function sendSettings(chatIdValue: string, userId: string): Promise<void> {
  const settings = getUserSettings(userId);
  await bot.sendMessage(chatIdValue, `⚙️ <b>Настройки</b>

BROKER: <b>${settings.broker}</b>
Депозит: <b>${settings.depositRub.toFixed(2)} ₽</b>
Риск на сделку: <b>${settings.riskPerTradePercent.toFixed(2)}%</b>
Инструменты: ${getInstruments().map(i => i.ticker).join(', ')}`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Изменить депозит', callback_data: 'settings:deposit' }],
        [{ text: 'Изменить риск %', callback_data: 'settings:risk' }],
      ],
    },
  });
}

async function handleSettingsCallback(query: TelegramBot.CallbackQuery): Promise<void> {
  const id = query.from.id.toString();
  const chat = query.message?.chat.id.toString() ?? id;
  if (query.data === 'settings:deposit') {
    textModes.set(id, 'set_deposit');
    await send(chat, 'Введите новый депозит в ₽:');
  } else {
    textModes.set(id, 'set_risk');
    await send(chat, 'Введите новый риск на сделку в %:');
  }
}

async function handleTradeDetails(chatIdValue: string, tradeId: number): Promise<void> {
  if (!tradeId) return send(chatIdValue, 'Укажите ID сделки: /trade 123');
  const trade = getTradeById(tradeId);
  await send(chatIdValue, trade ? formatTradeDetails(trade) : `Сделка #${tradeId} не найдена.`);
}

function parseTradeLine(userId: string, text: string): BcsTradeInput | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 8) return null;
  const [symbol, type, direction, entry, qty, stop, take, commission] = parts;
  const instrumentType = normalizeType(type);
  if (!instrumentType || (direction !== 'LONG' && direction !== 'SHORT')) return null;
  const entryPrice = parseNumber(entry);
  const quantity = parseNumber(qty);
  const stopLoss = parseNumber(stop);
  const takeProfit = parseNumber(take);
  const commissionRub = parseNumber(commission);
  if (!entryPrice || !quantity || !stopLoss || !takeProfit) return null;
  return { telegramId: userId, symbol: symbol.toUpperCase(), instrumentType, direction, entryPrice, quantity, stopLoss, takeProfit, commissionRub: commissionRub ?? undefined, comment: parts.slice(8).join(' ') };
}

function normalizeType(value: string): InstrumentType | null {
  const v = value.toLowerCase();
  if (['stock', 'акция'].includes(v)) return 'stock';
  if (['future', 'futures', 'фьючерс'].includes(v)) return 'future';
  if (['currency', 'валюта'].includes(v)) return 'currency';
  if (['bond', 'облигация'].includes(v)) return 'bond';
  if (['fund', 'фонд'].includes(v)) return 'fund';
  return null;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function typeLabel(type?: InstrumentType): string {
  const labels: Record<InstrumentType, string> = { stock: 'акция РФ', future: 'фьючерс MOEX', currency: 'валюта', bond: 'облигация', fund: 'фонд', option: 'опцион' };
  return type ? labels[type] : 'не указан';
}

function formatRub(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ₽`;
}

function formatPositionLine(trade: Trade): string {
  return `• #${trade.id} ${trade.symbol} ${trade.direction} @ ${trade.entryPrice} | qty ${trade.quantity} | риск ${trade.riskPercent?.toFixed(2) ?? '0'}%`;
}

function formatTradeLine(trade: Trade): string {
  return `• #${trade.id} ${trade.symbol} ${trade.direction} | ${trade.status} | риск ${trade.riskPercent?.toFixed(2) ?? '0'}% | P&L ${formatRub(trade.pnlRub ?? 0)}`;
}

function formatTradeDetails(trade: Trade): string {
  const risk: RiskCalculation = {
    positionAmountRub: trade.positionSize,
    riskRub: trade.riskRub ?? 0,
    riskPercentOfDeposit: trade.riskPercent ?? 0,
    potentialProfitRub: Math.abs(((trade.takeProfit ?? trade.takeProfit1) - trade.entryPrice) * (trade.quantity ?? 0)),
    riskReward: trade.riskReward ?? 0,
    commissionRub: trade.commissionRub ?? 0,
    pnlAtTakeProfitRub: 0,
    pnlAtStopRub: 0,
  };
  return `🧾 <b>Сделка #${trade.id}</b>

${trade.symbol} ${trade.direction}
Тип: ${typeLabel(trade.instrumentType)}
Статус: ${trade.status}
Вход: ${trade.entryPrice}
Количество: ${trade.quantity}
Стоп: ${trade.stopLoss}
Тейк: ${trade.takeProfit ?? trade.takeProfit1}
Комментарий: ${trade.comment || '—'}

${formatRiskCalculation(risk)}`;
}

function chatId(msg: TelegramBot.Message): string {
  return msg.chat.id.toString();
}

function fromId(msg: TelegramBot.Message): string {
  return msg.from?.id.toString() ?? msg.chat.id.toString();
}

async function send(chatIdValue: string, text: string): Promise<void> {
  await bot.sendMessage(chatIdValue, text, { parse_mode: 'HTML', disable_web_page_preview: true });
}

export async function broadcastMessage(text: string): Promise<void> {
  const target = config.telegram.chatId || config.telegram.adminId;
  if (target) await send(target, text);
}

export async function sendAdminMessage(text: string): Promise<void> {
  if (config.telegram.adminId) await send(config.telegram.adminId, text);
}

export async function sendErrorAlert(error: string, context?: string): Promise<void> {
  const target = config.telegram.adminId || config.telegram.chatId;
  if (target) await send(target, `⚠️ <b>Ошибка</b>\n${context ? `Контекст: ${context}\n` : ''}${error}`);
}

export async function broadcastSignal(): Promise<void> {
  // Disabled: BCS version is analytics-only and does not broadcast auto-execution signals.
}

export async function broadcastTradeOpened(): Promise<void> {
  // Disabled: BCS version never executes trades automatically.
}

export async function broadcastTradeClosed(): Promise<void> {
  // Reserved for manual close notifications.
}

export async function broadcastTpHit(): Promise<void> {
  // Reserved for manual position accompaniment.
}
