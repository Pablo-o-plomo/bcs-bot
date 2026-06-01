import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { logger } from '../utils/logger';
import { BUILD_VERSION } from '../version';
import { getMainKeyboard, getMenuKeyboard, getNavigationKeyboard, handleMenuCallback, setAdminCommandHandler } from './adminMenu';
import { calculateBcsCommission } from '../broker/bcsCommission';
import { bcsApiClient } from '../broker/bcs/client';
import { buildRawDebug } from '../broker/bcs/limits';
import { sanitizeSecret } from '../broker/bcs/errors';
import { borrowAvailable } from '../broker/bcs/shortable';
import { evaluateExecution } from '../execution/engine';
import { formatManualConfirm } from '../execution/confirmFlow';
import { getEmergencyStopStatus } from '../execution/emergencyStop';
import { calculatePositionRisk, calculateRiskReward, riskRewardWarning } from '../risk/riskManager';
import { getMoexSecurityData, formatMoexAnalysis } from '../market/moexClient';
import { getMarketSnapshot } from '../market/moex';
import { scanMarket, getTopList } from '../market/scanner';
import { formatMarketOverview, formatScanner, formatTopList } from '../market/formatter';
import type { TopListMode } from '../market/types';
import { reviewTrade } from '../ai/tradeReview';
import { analyzeDeal, analyzeMarket, analyzePortfolio } from '../ai/analyzer';
import { fallbackMarketAnalysis, fallbackPortfolioAnalysis } from '../ai/fallback';
import { analyzeMarketState } from '../market/state-engine';
import {
  ensureUser,
  getBrokerFee,
  getInstruments,
  getLastNTrades,
  getMonthTrades,
  getOpenTrades,
  getPositions,
  getLatestBcsPortfolioSnapshot,
  getBcsPositions,
  getTodayTrades,
  getTradeById,
  getUserSettings,
  getWinrateBySymbol,
  saveAiReview,
  saveTrade,
  updateBrokerFee,
  updateUserSettings,
} from '../database/db';
import type { Direction, InstrumentType, TradeInput } from '../database/models';

let bot: TelegramBot;

type DraftStep = 'instrumentType' | 'ticker' | 'direction' | 'entryPrice' | 'quantity' | 'stopLoss' | 'takeProfit' | 'comment' | 'confirm';
interface DraftTrade { step: DraftStep; data: Partial<TradeInput>; promptMessageId?: number; summary?: string }
const drafts = new Map<string, DraftTrade>();
const textModes = new Map<string, 'instrument_analysis' | 'ai_review' | 'ai_deal' | 'set_deposit' | 'set_risk' | 'set_daily_loss' | 'set_max_positions' | 'set_tariff'>();
const SUPPORTED_INSTRUMENTS = new Set(config.execution.allowedSymbols.map(symbol => symbol.toUpperCase()));

export function initTelegramBot(): TelegramBot {
  if (!config.telegram.botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  bot = new TelegramBot(config.telegram.botToken, { polling: true });
  setAdminCommandHandler(handleCommand);
  registerCommands();
  logger.info(`🤖 BCS Assistant Bot started. Build: ${BUILD_VERSION}`);
  return bot;
}

function registerCommands(): void {
  bot.onText(/^\/start(?:\s|$)/, handleStart);
  bot.onText(/^\/menu(?:\s|$)/, handleMenu);
  bot.onText(/^\/portfolio/, msg => handleCommand(chatId(msg), '/portfolio', fromId(msg)));
  bot.onText(/^\/limits/, msg => handleCommand(chatId(msg), '/limits', fromId(msg)));
  bot.onText(/^\/debug_limits/, msg => handleCommand(chatId(msg), '/debug_limits', fromId(msg)));
  bot.onText(/^\/debug_portfolio|^\/debugportfolio/, msg => handleCommand(chatId(msg), '/debug_portfolio', fromId(msg)));
  bot.onText(/^\/add_trade/, msg => handleCommand(chatId(msg), '/add_trade', fromId(msg)));
  bot.onText(/^\/analyze(?:\s+(.+))?/, (msg, match) => handleAnalyze(msg, match?.[1]));
  bot.onText(/^\/ai_review/, msg => handleCommand(chatId(msg), '/ai_review', fromId(msg)));
  bot.onText(/^\/ai_portfolio/, msg => handleCommand(chatId(msg), '/ai_portfolio', fromId(msg)));
  bot.onText(/^\/ai_market/, msg => handleCommand(chatId(msg), '/ai_market', fromId(msg)));
  bot.onText(/^\/ai_risk/, msg => handleCommand(chatId(msg), '/ai_risk', fromId(msg)));
  bot.onText(/^\/ai_deal/, msg => handleCommand(chatId(msg), '/ai_deal', fromId(msg)));
  bot.onText(/^\/market/, msg => handleCommand(chatId(msg), '/market', fromId(msg)));
  bot.onText(/^\/scanner/, msg => handleCommand(chatId(msg), '/scanner', fromId(msg)));
  bot.onText(/^\/top(?:\s+(gainers|losers|volume))?/, (msg, match) => handleCommand(chatId(msg), `/top_${normalizeTopMode(match?.[1])}`, fromId(msg)));
  bot.onText(/^Разбери сделку(?:\s+(.+))?/i, (msg, match) => handleAiReviewText(msg, match?.[1]));
  bot.onText(/^\/risk_status/, msg => handleCommand(chatId(msg), '/risk_status', fromId(msg)));
  bot.onText(/^\/risk/, msg => handleCommand(chatId(msg), '/risk', fromId(msg)));
  bot.onText(/^\/paper/, msg => handleCommand(chatId(msg), '/paper', fromId(msg)));
  bot.onText(/^\/execution/, msg => handleCommand(chatId(msg), '/execution', fromId(msg)));
  bot.onText(/^\/emergency_stop/, msg => handleCommand(chatId(msg), '/emergency_stop', fromId(msg)));
  bot.onText(/^\/api_status/, msg => handleCommand(chatId(msg), '/api_status', fromId(msg)));
  bot.onText(/^\/commissions/, msg => handleCommand(chatId(msg), '/commissions', fromId(msg)));
  bot.onText(/^\/diary/, msg => handleCommand(chatId(msg), '/diary', fromId(msg)));
  bot.onText(/^\/journal/, msg => handleCommand(chatId(msg), '/journal', fromId(msg)));
  bot.onText(/^\/daily_report/, msg => handleCommand(chatId(msg), '/daily_report', fromId(msg)));
  bot.onText(/^\/monthly_report/, msg => handleCommand(chatId(msg), '/monthly_report', fromId(msg)));
  bot.onText(/^\/settings/, msg => handleCommand(chatId(msg), '/settings', fromId(msg)));
  bot.onText(/^\/trade(?:\s+(\d+))?/, (msg, match) => handleTradeDetails(chatId(msg), Number(match?.[1])));

  bot.on('callback_query', async query => {
    try {
      if (query.data?.startsWith('draft:')) return handleDraftCallback(query);
      if (query.data?.startsWith('settings:')) return handleSettingsCallback(query);
      await handleMenuCallback(bot, query);
    } catch (err: any) {
      logger.error(`Callback error: ${err.message}`);
      await bot.answerCallbackQuery(query.id, { text: 'Ошибка' }).catch(() => undefined);
    }
  });

  bot.on('message', async msg => {
    if (!msg.text || msg.text.startsWith('/') || /^Разбери сделку/i.test(msg.text)) return;
    const userId = fromId(msg);
    ensureUser(userId);
    if (drafts.has(userId)) return handleDraftText(msg);
    const mode = textModes.get(userId);
    if (mode) return handleTextMode(msg, mode);
  });

  bot.on('polling_error', err => logger.error(`Telegram polling error: ${err.message}`));
}

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  ensureUser(fromId(msg));
  await openMainMenu(msg.chat.id.toString());
}

async function handleMenu(msg: TelegramBot.Message): Promise<void> {
  ensureUser(fromId(msg));
  await openMainMenu(msg.chat.id.toString());
}

async function openMainMenu(chatIdValue: string): Promise<void> {
  logger.info('menu_opened');
  await bot.sendMessage(chatIdValue, buildWelcomeScreen(), { parse_mode: 'HTML', reply_markup: getMainKeyboard(), disable_web_page_preview: true });
  logger.info('main_menu_rendered');
}

function buildWelcomeScreen(): string {
  return `🤖 <b>BCS Assistant Bot</b>

━━━━━━━━━━━━━━
✅ <b>Подключение к BCS API активно.</b>
🔒 <b>Автоторговля отключена.</b>
🛡️ <b>Режим:</b> безопасный мониторинг.
━━━━━━━━━━━━━━

Выберите раздел:`;
}

async function handleCommand(chatIdValue: string, command: string, telegramId = chatIdValue, menuMessageId?: number): Promise<void> {
  ensureUser(telegramId);
  if (menuMessageId) return renderMenuScreen(chatIdValue, menuMessageId, command, telegramId);
  if (command === '/portfolio' || command === '/real_portfolio') return send(chatIdValue, await buildRealPortfolio(telegramId));
  if (command === '/add_trade') return startAddTrade(chatIdValue, telegramId);
  if (command === '/analyze_instrument') return requestInstrument(chatIdValue, telegramId);
  if (command === '/ai_review') return requestAiReview(chatIdValue, telegramId);
  if (command === '/risk') return send(chatIdValue, buildRiskManagement(telegramId));
  if (command === '/commissions') return send(chatIdValue, buildCommissions(telegramId));
  if (command === '/diary' || command === '/journal') return send(chatIdValue, buildDiary(telegramId));
  if (command === '/daily_report') return send(chatIdValue, buildReport(telegramId, 'day'));
  if (command === '/monthly_report') return send(chatIdValue, buildReport(telegramId, 'month'));
  if (command === '/api_status') {
    if (!isAdminAllowed(telegramId)) return send(chatIdValue, '⛔️ Раздел доступен только администратору.');
    return send(chatIdValue, buildApiStatus());
  }
  if (command === '/limits') return send(chatIdValue, await buildLimits(telegramId));
  if (command === '/ai_analysis') return send(chatIdValue, await buildAiMarketAnalysis());
  if (command === '/ai_portfolio') return send(chatIdValue, await buildAiPortfolioAnalysis(telegramId));
  if (command === '/ai_market' || command === '/ai_market_summary') return send(chatIdValue, await buildAiMarketAnalysis());
  if (command === '/ai_risk') return send(chatIdValue, await buildAiRiskAnalysis(telegramId));
  if (command === '/ai_deal' || command === '/ai_trade') return send(chatIdValue, buildAiDealPrompt(telegramId));
  if (command === '/market') return send(chatIdValue, await buildMarketOverview());
  if (command === '/scanner') return send(chatIdValue, await buildMarketScanner());
  if (command === '/top_gainers') return send(chatIdValue, await buildMarketTop('gainers'));
  if (command === '/top_losers') return send(chatIdValue, await buildMarketTop('losers'));
  if (command === '/top_volume') return send(chatIdValue, await buildMarketTop('volume'));
  if (command === '/news') return send(chatIdValue, buildSectionInDevelopment());
  if (command === '/help') return send(chatIdValue, buildHelp());
  if (command === '/settings_menu' || command === '/submenu_settings') return send(chatIdValue, buildSettingsScreen(telegramId));
  if (command === '/risk_menu' || command === '/submenu_risk') return send(chatIdValue, buildRiskManagement(telegramId));
  if (command === '/diary_menu') return send(chatIdValue, buildDiary(telegramId));
  if (command === '/daily_report_menu') return send(chatIdValue, buildReport(telegramId, 'day'));
  if (command === '/debug_limits') return send(chatIdValue, await buildDebugLimits(telegramId));
  if (command === '/debug_portfolio') return handleDebugPortfolio(chatIdValue, telegramId);
  if (command === '/export' || command === '/watchlist') return send(chatIdValue, buildSectionInDevelopment());

  if (command === '/set_deposit' || command === '/set_risk' || command === '/set_daily_loss' || command === '/set_max_positions' || command === '/set_tariff') return send(chatIdValue, buildSettingsActionScreen(command, telegramId));
  if (command === '/paper' || command === '/paper_mode') return send(chatIdValue, buildPaperModeStatus());
  if (command === '/execution' || command === '/execution_mode') return send(chatIdValue, buildExecutionStatus());
  if (command === '/risk_status') return send(chatIdValue, buildRiskStatus(telegramId));
  if (command === '/emergency_stop') return send(chatIdValue, buildEmergencyStopStatus());
  if (command === '/settings') return sendSettings(chatIdValue, telegramId);
}


async function renderMenuScreen(chatIdValue: string, messageId: number, command: string, telegramId: string): Promise<void> {
  logger.info(`menu_navigation: command=${command}`);
  if (command === '/menu') {
    await editMenuMessage(chatIdValue, messageId, buildWelcomeScreen(), getMenuKeyboard('/menu'));
    logger.info('screen_rendered: main_menu');
    logger.info('main_menu_rendered');
    return;
  }

  const targetMessageId = await editMenuMessage(chatIdValue, messageId, '⏳ <b>Загружаю...</b>', getNavigationKeyboard());
  const aiCommand = isAiCommand(command);
  if (aiCommand) logger.info(`ai_callback_started: ${command}`);
  try {
    const textPromise = buildMenuScreenText(command, telegramId);
    const text = aiCommand
      ? await withTimeout(textPromise, 5000, buildAiTimeoutFallback(command, telegramId), `ai_callback:${command}`)
      : await textPromise;
    await renderOrSend({ chatIdValue, telegramId, menuMessageId: targetMessageId }, text, getMenuKeyboard(command));
    logger.info(`screen_rendered: ${command}`);
    if (command.startsWith('/submenu_')) logger.info(`submenu_rendered: ${command}`);
    if (aiCommand) logger.info(`ai_callback_finished: ${command}`);
  } catch (err: any) {
    if (aiCommand) logger.warn(`ai_callback_failed: ${command}: ${err?.message ?? err}`);
    const text = aiCommand ? buildAiExceptionFallback(command, telegramId) : buildUiScreen('⚠️ <b>Ошибка</b>', 'BCS Assistant Bot', 'Не удалось загрузить раздел. Вернитесь в главное меню.', new Date().toISOString(), false);
    await renderOrSend({ chatIdValue, telegramId, menuMessageId: targetMessageId }, text, getMenuKeyboard(command));
  }
}

async function buildMenuScreenText(command: string, telegramId: string): Promise<string> {
  logMenuCommandReuse(command);
  if (command === '/submenu_portfolio') return buildSubmenuScreen('📊 <b>Портфель</b>', 'Выберите данные по счету BCS или debug-раздел.');
  if (command === '/submenu_debug') return buildSubmenuScreen('🧪 <b>Debug</b>', 'Диагностика raw-ответов BCS API. Раздел скрыт из главного меню.');
  if (command === '/submenu_market') return buildSubmenuScreen('📈 <b>Рынок</b>', 'MOEX-обзор, сканер и лидерборды рынка.');
  if (command === '/submenu_ai') return buildSubmenuScreen('🧠 <b>AI Анализ</b>', 'AI-разборы портфеля, сделок, риска и рынка.');
  if (command === '/submenu_risk' || command === '/risk_menu') return buildSubmenuScreen('⚠️ <b>Риск</b>', 'Статусы risk/paper/execution/emergency stop и риск-настройки.');
  if (command === '/submenu_reports') return buildSubmenuScreen('📋 <b>Отчеты</b>', 'Дневник сделок, дневные/месячные отчеты, комиссии и экспорт.');
  if (command === '/submenu_settings' || command === '/settings_menu' || command === '/settings') return buildSettingsScreen(telegramId);
  if (command === '/portfolio' || command === '/real_portfolio') return buildMenuPortfolioScreen(telegramId);
  if (command === '/limits') return buildMenuLimitsScreen(telegramId);
  if (command === '/api_status') return isAdminAllowed(telegramId) ? buildApiStatus() : buildUiScreen('🔌 <b>Статус BCS API</b>', 'BCS Assistant Bot', '⛔️ Раздел доступен только администратору.', new Date().toISOString(), false);
  if (command === '/debug_limits') return buildDebugLimits(telegramId);
  if (command === '/debug_portfolio') return buildDebugPortfolioText(telegramId);
  if (command === '/market') return buildMarketOverview();
  if (command === '/scanner') return buildMarketScanner();
  if (command === '/top_gainers') return buildMarketTop('gainers');
  if (command === '/top_losers') return buildMarketTop('losers');
  if (command === '/top_volume') return buildMarketTop('volume');
  if (command === '/export' || command === '/watchlist') return buildSectionInDevelopment();
  if (command === '/ai_analysis') return buildAiMarketAnalysis();
  if (command === '/ai_portfolio') return buildAiPortfolioAnalysis(telegramId);
  if (command === '/ai_market' || command === '/ai_market_summary') return buildAiMarketAnalysis();
  if (command === '/ai_risk') return buildAiRiskAnalysis(telegramId);
  if (command === '/ai_deal' || command === '/ai_trade') return buildAiDealPrompt(telegramId);
  if (command === '/risk' || command === '/risk_settings') return buildRiskManagement(telegramId);
  if (command === '/risk_status') return buildRiskStatus(telegramId);
  if (command === '/paper' || command === '/paper_mode') return buildPaperModeStatus();
  if (command === '/execution' || command === '/execution_mode') return buildExecutionStatus();
  if (command === '/emergency_stop') return buildEmergencyStopStatus();
  if (command === '/journal' || command === '/diary' || command === '/diary_menu') return buildDiary(telegramId);
  if (command === '/daily_report' || command === '/daily_report_menu') return buildReport(telegramId, 'day');
  if (command === '/monthly_report') return buildReport(telegramId, 'month');
  if (command === '/commissions') return buildCommissions(telegramId);
  if (command === '/set_deposit' || command === '/set_risk' || command === '/set_daily_loss' || command === '/set_max_positions' || command === '/set_tariff') return buildSettingsActionScreen(command, telegramId);
  if (command === '/help') return buildHelp();
  return buildWelcomeScreen();
}



function isAiCommand(command: string): boolean {
  return ['/ai_analysis', '/ai_portfolio', '/ai_market', '/ai_market_summary', '/ai_risk', '/ai_deal', '/ai_trade'].includes(command);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<T>(resolve => {
    timeoutId = globalThis.setTimeout(() => {
      logger.warn(`ai_timeout: ${label}`);
      resolve(fallback);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

function buildAiTimeoutFallback(command: string, telegramId: string): string {
  logger.info(`ai_fallback_used: timeout:${command}`);
  if (command === '/ai_risk') return buildAiRiskLocalFallback(telegramId, true);
  if (command === '/ai_deal' || command === '/ai_trade') return buildAiDealPrompt(telegramId);
  return buildAiExceptionFallback(command, telegramId);
}

function buildAiExceptionFallback(command: string, telegramId: string): string {
  logger.info(`ai_fallback_used: exception:${command}`);
  if (command === '/ai_risk') return buildAiRiskLocalFallback(telegramId, true);
  if (command === '/ai_portfolio') return buildAiPortfolioLocalFallback(telegramId);
  if (command === '/ai_deal' || command === '/ai_trade') return buildAiDealPrompt(telegramId);
  if (command === '/ai_market' || command === '/ai_market_summary' || command === '/ai_analysis') return buildAiMarketLocalFallback();
  return buildUiScreen('🧠 <b>AI-анализ</b>', 'Локальный rule-based fallback', `⚠️ AI-анализ временно недоступен. Показываю базовую оценку.

Сценарий: режим наблюдения / paper mode.
Риск: не открывать реальные сделки без плана, стопа и подтверждения условий входа.
Что проверить: рыночный фон, объем, RR и дневной лимит риска.

⚠️ <i>Это не инвестиционная рекомендация.</i>`, new Date().toISOString(), false);
}


interface RenderContext { chatIdValue: string; telegramId: string; menuMessageId?: number }

async function renderOrSend(ctx: RenderContext, text: string, replyMarkup?: TelegramBot.SendMessageOptions['reply_markup']): Promise<number | undefined> {
  if (ctx.menuMessageId) {
    return editMenuMessage(ctx.chatIdValue, ctx.menuMessageId, text, replyMarkup ?? getNavigationKeyboard());
  }
  const sent = await bot.sendMessage(ctx.chatIdValue, text, { parse_mode: 'HTML', reply_markup: replyMarkup, disable_web_page_preview: true });
  return sent.message_id;
}

function logMenuCommandReuse(command: string): void {
  if (isPlaceholderCommand(command)) {
    logger.info(`callback_placeholder_used: ${command}`);
    return;
  }
  if (isExistingHandlerCommand(command)) {
    logger.info(`callback_mapped_to_existing_handler: ${command}`);
    logger.info(`existing_handler_reused: ${command}`);
  }
}

function isPlaceholderCommand(command: string): boolean {
  return ['/export', '/watchlist'].includes(command);
}

function isExistingHandlerCommand(command: string): boolean {
  return ['/market', '/scanner', '/top_gainers', '/top_losers', '/top_volume', '/ai_analysis', '/ai_portfolio', '/ai_market', '/ai_market_summary', '/ai_risk', '/ai_deal', '/ai_trade', '/portfolio', '/real_portfolio', '/limits', '/api_status', '/debug_limits', '/debug_portfolio', '/risk', '/risk_settings', '/risk_status', '/paper', '/paper_mode', '/execution', '/execution_mode', '/emergency_stop', '/journal', '/diary', '/daily_report', '/monthly_report', '/commissions', '/settings', '/set_deposit', '/set_risk', '/set_daily_loss', '/set_max_positions', '/set_tariff', '/help'].includes(command);
}

async function editMenuMessage(chatIdValue: string, messageId: number, text: string, replyMarkup: TelegramBot.SendMessageOptions['reply_markup']): Promise<number> {
  let targetMessageId = messageId;
  let textEdited = false;
  try {
    await bot.editMessageText(text, {
      chat_id: chatIdValue,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
    textEdited = true;
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (message.includes('message is not modified')) {
      textEdited = true;
    } else {
      logger.warn(`edit_message_failed: ${message}`);
      const fallback = await bot.sendMessage(chatIdValue, text, { parse_mode: 'HTML', reply_markup: replyMarkup, disable_web_page_preview: true });
      targetMessageId = fallback.message_id;
    }
  }

  if (textEdited) {
    try {
      await (bot as any).editMessageReplyMarkup(replyMarkup, { chat_id: chatIdValue, message_id: targetMessageId });
    } catch (err: any) {
      const message = String(err?.message ?? err);
      if (!message.includes('message is not modified')) logger.warn(`edit_message_failed: ${message}`);
    }
  }
  return targetMessageId;
}

async function startAddTrade(chatIdValue: string, telegramId: string): Promise<void> {
  const user = ensureUser(telegramId);
  const message = await bot.sendMessage(chatIdValue, '📝 Выберите тип инструмента:', {
    reply_markup: getInstrumentTypeKeyboard(),
  });
  drafts.set(telegramId, { step: 'instrumentType', data: { userId: user.id }, promptMessageId: message.message_id });
}


function getInstrumentTypeKeyboard(): TelegramBot.SendMessageOptions['reply_markup'] {
  return {
    inline_keyboard: [
      [{ text: 'Акция', callback_data: 'draft:type:stock' }, { text: 'Фьючерс', callback_data: 'draft:type:future' }],
      [{ text: 'Валюта', callback_data: 'draft:type:currency' }, { text: 'Облигация', callback_data: 'draft:type:bond' }],
      [{ text: 'Фонд', callback_data: 'draft:type:fund' }],
      [{ text: '❌ Отмена', callback_data: 'draft:cancel' }],
    ],
  };
}

function getTickerPrompt(type: InstrumentType): string {
  const prompts: Record<InstrumentType, string> = {
    stock: 'Вы выбрали: Акция.\nВведите тикер российской акции: SBER, GAZP, LKOH, YNDX, TATN.\nВажно: шорт доступен не по всем акциям.',
    future: 'Вы выбрали: Фьючерс.\nВведите код фьючерса: Si, BR, GOLD, IMOEX.\nФьючерсы удобнее для шорта и активной торговли, но требуют учета ГО и риска.',
    currency: 'Вы выбрали: Валюта.\nВведите валютный инструмент: USD/RUB, CNY/RUB.\nВажно: комиссия БКС по валюте отличается от акций.',
    bond: 'Вы выбрали: Облигация.\nВведите тикер или ISIN облигации.\nОблигации больше подходят для спокойной доходности, не для активного трейдинга.',
    fund: 'Вы выбрали: Фонд.\nВведите тикер фонда: SBMX, TMOS, AKME.\nФонды чаще подходят для среднесрочного удержания.',
    option: 'Вы выбрали: Опцион.\nВведите код опциона.\nОпционы требуют отдельного учета риска и ликвидности.',
  };
  return prompts[type];
}

function getTickerPromptKeyboard(): TelegramBot.SendMessageOptions['reply_markup'] {
  return {
    inline_keyboard: [
      [{ text: 'Акция', callback_data: 'draft:type:stock' }, { text: 'Фьючерс', callback_data: 'draft:type:future' }],
      [{ text: 'Валюта', callback_data: 'draft:type:currency' }, { text: 'Облигация', callback_data: 'draft:type:bond' }],
      [{ text: 'Фонд', callback_data: 'draft:type:fund' }],
      [{ text: '⬅️ Назад', callback_data: 'draft:back' }, { text: '❌ Отмена', callback_data: 'draft:cancel' }],
    ],
  };
}

async function updateInstrumentTypePrompt(chatIdValue: string, draft: DraftTrade, type: InstrumentType, messageId?: number): Promise<void> {
  const targetMessageId = messageId ?? draft.promptMessageId;
  await editDraftMessage(chatIdValue, targetMessageId, getTickerPrompt(type), getTickerPromptKeyboard());
}

async function editDraftMessage(chatIdValue: string, messageId: number | undefined, text: string, replyMarkup?: TelegramBot.SendMessageOptions['reply_markup']): Promise<void> {
  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatIdValue,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
      return;
    } catch (err: any) {
      logger.warn(`Failed to edit draft message: ${err.message}`);
    }
  }
  await bot.sendMessage(chatIdValue, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
}

async function handleDraftCallback(query: TelegramBot.CallbackQuery): Promise<void> {
  await bot.answerCallbackQuery(query.id, { text: 'OK' });
  const telegramId = query.from.id.toString();
  const chat = query.message?.chat.id.toString() ?? telegramId;
  const draft = drafts.get(telegramId);
  if (!draft) return startAddTrade(chat, telegramId);
  const [, action, value] = query.data?.split(':') ?? [];
  if (action === 'type') {
    draft.data.instrumentType = value as InstrumentType;
    draft.step = 'ticker';
    draft.promptMessageId = query.message?.message_id ?? draft.promptMessageId;
    drafts.set(telegramId, draft);
    logger.info(`Instrument type selected: user=${telegramId}, type=${value}`);
    return updateInstrumentTypePrompt(chat, draft, value as InstrumentType, query.message?.message_id);
  }
  if (action === 'back') {
    draft.step = 'instrumentType';
    draft.data.instrumentType = undefined;
    draft.data.ticker = undefined;
    drafts.set(telegramId, draft);
    return editDraftMessage(chat, query.message?.message_id ?? draft.promptMessageId, '📝 Выберите тип инструмента:', getInstrumentTypeKeyboard());
  }
  if (action === 'direction') {
    draft.data.direction = value as Direction;
    draft.step = 'entryPrice';
    drafts.set(telegramId, draft);
    return send(chat, 'Введите цену входа:');
  }
  if (action === 'save') {
    if (!draft.data.userId) draft.data.userId = ensureUser(telegramId).id;
    const id = saveTrade(draft.data as TradeInput);
    drafts.delete(telegramId);
    return send(chat, `✅ Сделка #${id} сохранена.\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`);
  }
  if (action === 'cancel') {
    drafts.delete(telegramId);
    return editDraftMessage(chat, query.message?.message_id ?? draft.promptMessageId, '❌ Добавление сделки отменено.');
  }
}

async function handleDraftText(msg: TelegramBot.Message): Promise<void> {
  const telegramId = fromId(msg);
  const chat = chatId(msg);
  const draft = drafts.get(telegramId);
  if (!draft || !msg.text) return;
  const text = msg.text.trim();

  if (draft.step === 'ticker') {
    const normalizedTicker = normalizeSupportedTicker(text);
    if (!normalizedTicker) return send(chat, 'Инструмент пока не поддерживается. Доступны: Si, BR, GOLD, IMOEX, SBER, GAZP, LKOH.');
    draft.data.ticker = normalizedTicker;
    draft.step = 'direction';
    drafts.set(telegramId, draft);
    return bot.sendMessage(chat, 'Выберите направление:', { reply_markup: { inline_keyboard: [[{ text: 'LONG', callback_data: 'draft:direction:LONG' }, { text: 'SHORT', callback_data: 'draft:direction:SHORT' }]] } });
  }

  const value = parseNumber(text);
  if (draft.step === 'entryPrice') {
    if (!value) return send(chat, 'Введите корректную цену входа.');
    draft.data.entryPrice = value;
    draft.step = 'quantity';
    drafts.set(telegramId, draft);
    return send(chat, 'Введите количество:');
  }
  if (draft.step === 'quantity') {
    if (!value) return send(chat, 'Введите корректное количество.');
    draft.data.quantity = value;
    draft.step = 'stopLoss';
    drafts.set(telegramId, draft);
    return send(chat, 'Введите стоп-лосс:');
  }
  if (draft.step === 'stopLoss') {
    if (!value) return send(chat, 'Введите корректный стоп-лосс.');
    draft.data.stopLoss = value;
    draft.step = 'takeProfit';
    drafts.set(telegramId, draft);
    return send(chat, 'Введите тейк-профит:');
  }
  if (draft.step === 'takeProfit') {
    if (!value) return send(chat, 'Введите корректный тейк-профит.');
    draft.data.takeProfit = value;
    draft.step = 'comment';
    drafts.set(telegramId, draft);
    return send(chat, 'Введите комментарий или «-»:');
  }
  if (draft.step === 'comment') {
    draft.data.comment = text === '-' ? '' : text;
    await prepareDraftSummary(chat, telegramId, draft);
  }
}

async function prepareDraftSummary(chat: string, telegramId: string, draft: DraftTrade): Promise<void> {
  const data = draft.data as TradeInput;
  const settings = getUserSettings(telegramId);
  const fee = getBrokerFee(settings.userId);
  const commission = calculateBcsCommission({
    instrumentType: data.instrumentType,
    price: data.entryPrice,
    quantity: data.quantity,
    direction: data.direction,
    ticker: data.ticker,
    stockFeePercent: fee.stockFeePercent,
    currencyFeePercent: fee.currencyFeePercent,
    futuresFeePerContract: fee.futuresFeePerContract,
    extraCurrencyBuyFeePercent: fee.extraCurrencyBuyFeePercent,
  });
  const risk = calculatePositionRisk({ depositRub: settings.depositRub, entryPrice: data.entryPrice, stopLoss: data.stopLoss, quantity: data.quantity, direction: data.direction, commissionRub: commission.commissionRub, riskPerTradePercent: settings.riskPerTrade });
  const rr = calculateRiskReward({ entryPrice: data.entryPrice, stopLoss: data.stopLoss, takeProfit: data.takeProfit, direction: data.direction });
  data.commission = commission.commissionRub;
  data.rr = rr.rr;
  data.status = 'open';
  const warning = riskRewardWarning(rr.rr);
  const shortInfo = data.direction === 'SHORT' ? await borrowAvailable(data.ticker) : null;
  draft.step = 'confirm';
  drafts.set(telegramId, draft);
  const executionOrder = { symbol: data.ticker, direction: data.direction, instrumentType: data.instrumentType, entryPrice: data.entryPrice, quantity: data.quantity, stopLoss: data.stopLoss, takeProfit: data.takeProfit, orderType: 'LIMIT' as const, commissionRub: commission.commissionRub, rr: rr.rr, riskPercent: risk.riskPercent, comment: data.comment };
  const execution = await evaluateExecution(executionOrder, telegramId);
  const executionText = formatManualConfirm(executionOrder, execution.validation);
  const localRiskText = `

🧾 <b>Локальный расчет</b>
Сумма позиции: <b>${risk.positionSizeRub.toFixed(2)} ₽</b>
Риск: <b>${risk.riskRub.toFixed(2)} ₽</b>
Риск %: <b>${risk.riskPercent.toFixed(2)}%</b>
RR: <b>1:${rr.rr.toFixed(2)}</b>
Комиссия БКС: <b>${commission.commissionRub.toFixed(2)} ₽</b>
Детали комиссии: ${commission.details}
Итог дневника: <b>${risk.allowed ? '✅ Сделка разрешена' : '❌ Сделка запрещена'}</b>
${risk.reason}
${warning ?? ''}
${shortInfo ? shortInfo.reason : ''}`;
  await bot.sendMessage(chat, `${executionText}${localRiskText}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'draft:save' }, { text: '❌ Отмена', callback_data: 'draft:cancel' }]] } });
}

async function requestInstrument(chat: string, telegramId: string): Promise<void> {
  textModes.set(telegramId, 'instrument_analysis');
  await send(chat, 'Введите тикер MOEX для анализа: SBER, GAZP, LKOH, IMOEX, Si, BR, GOLD.');
}

async function handleAnalyze(msg: TelegramBot.Message, ticker?: string): Promise<void> {
  ensureUser(fromId(msg));
  if (!ticker) return send(chatId(msg), await buildAiMarketAnalysis());
  await processMoexAnalysis(chatId(msg), ticker);
}

async function processMoexAnalysis(chat: string, ticker: string): Promise<void> {
  const normalizedTicker = normalizeSupportedTicker(ticker);
  if (!normalizedTicker) return send(chat, 'Инструмент пока не поддерживается. Доступны: Si, BR, GOLD, IMOEX, SBER, GAZP, LKOH.');
  try {
    const data = await getMoexSecurityData(normalizedTicker);
    await send(chat, formatMoexAnalysis(data));
  } catch (err: any) {
    await send(chat, `📈 Анализ инструмента\n\nНе удалось получить данные MOEX по тикеру <b>${escapeHtml(normalizedTicker)}</b>: ${escapeHtml(err.message)}\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`);
  }
}

async function requestAiReview(chat: string, telegramId: string): Promise<void> {
  textModes.set(telegramId, 'ai_review');
  await send(chat, 'Опишите сделку или отправьте строку: SBER stock LONG 270 10 260 290 комментарий');
}

async function handleAiReviewText(msg: TelegramBot.Message, payload?: string): Promise<void> {
  if (!payload) return requestAiReview(chatId(msg), fromId(msg));
  await processAiReview(chatId(msg), fromId(msg), payload);
}

async function handleTextMode(msg: TelegramBot.Message, mode: string): Promise<void> {
  const telegramId = fromId(msg);
  const chat = chatId(msg);
  textModes.delete(telegramId);
  const text = msg.text?.trim() ?? '';
  if (mode === 'instrument_analysis') return processMoexAnalysis(chat, text);
  if (mode === 'ai_review') return processAiReview(chat, telegramId, text);
  if (mode === 'ai_deal') return processAiDeal(chat, telegramId, text);
  const value = parseNumber(text);
  if (value === null) return send(chat, 'Введите число.');
  if (mode === 'set_deposit') updateUserSettings(telegramId, { depositRub: value });
  if (mode === 'set_risk') updateUserSettings(telegramId, { riskPerTrade: value });
  if (mode === 'set_daily_loss') updateUserSettings(telegramId, { maxDailyLoss: value });
  if (mode === 'set_max_positions') updateUserSettings(telegramId, { maxOpenPositions: value });
  if (mode === 'set_tariff') updateBrokerFee(ensureUser(telegramId).id, { stockFeePercent: value });
  await send(chat, '✅ Настройка сохранена.');
}

async function processAiReview(chat: string, telegramId: string, text: string): Promise<void> {
  const parsed = parseTradeLine(telegramId, text);
  const review = await reviewTrade(parsed, text, getUserSettings(telegramId));
  saveAiReview({ reviewText: review.reviewText, score: review.score });
  await send(chat, review.reviewText);
}



async function buildMarketOverview(): Promise<string> {
  const snapshot = await getMarketSnapshot();
  const { signals } = await scanMarket();
  const { instruments: gainers } = await getTopList('gainers');
  const { instruments: losers } = await getTopList('losers');
  return formatMarketOverview(snapshot, signals, gainers, losers);
}

async function buildMarketScanner(): Promise<string> {
  const { snapshot, signals } = await scanMarket();
  return formatScanner(snapshot, signals);
}

async function buildMarketTop(mode: TopListMode): Promise<string> {
  const { snapshot, instruments } = await getTopList(mode);
  return formatTopList(snapshot, mode, instruments);
}

function normalizeTopMode(value?: string): TopListMode {
  if (value === 'losers') return 'losers';
  if (value === 'volume') return 'volume';
  return 'gainers';
}



async function withBcsPortfolioTimeout(): Promise<Awaited<ReturnType<typeof bcsApiClient.getPortfolio>> | null> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => {
    timeoutId = globalThis.setTimeout(() => {
      logger.warn('ai_bcs_timeout: portfolio');
      logger.info('ai_fallback_used: portfolio_bcs_timeout');
      resolve(null);
    }, 3000);
  });
  try {
    return await Promise.race([bcsApiClient.getPortfolio(), timeout]);
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}


function buildAiPortfolioLocalFallback(telegramId: string): string {
  const settings = getUserSettings(telegramId);
  const snapshot = getLatestBcsPortfolioSnapshot();
  const localPositions = getBcsPositions();
  logger.info('ai_analysis_fallback: portfolio_local');
  return fallbackPortfolioAnalysis({
    balance: snapshot?.balance ?? settings.depositRub,
    freeCash: snapshot?.freeCash ?? 0,
    portfolioValue: snapshot?.portfolioValue ?? 0,
    dayPnl: snapshot?.dayPnl ?? 0,
    totalPnl: snapshot?.totalPnl ?? 0,
    cash: [{ currency: 'RUB', available: snapshot?.freeCash ?? 0, blocked: 0, total: snapshot?.freeCash ?? 0, currentValueRub: snapshot?.freeCash ?? 0 }],
    positions: localPositions.map(position => ({
      ticker: position.ticker,
      name: position.name,
      quantity: position.quantity,
      averagePrice: position.averagePrice,
      currentPrice: position.currentPrice,
      currentValueRub: position.currentPrice * position.quantity,
      unrealizedPnl: position.unrealizedPnl,
      portfolioSharePercent: position.portfolioSharePercent,
    })),
    settings,
    source: config.bcsApi.enabled ? '⚠️ BCS API долго отвечает. Показываю локальный анализ.' : 'Локальный snapshot',
  });
}

async function buildAiPortfolioAnalysis(telegramId: string): Promise<string> {
  const settings = getUserSettings(telegramId);
  if (config.bcsApi.enabled) {
    try {
      const portfolio = await withBcsPortfolioTimeout();
      if (portfolio) {
        return analyzePortfolio({
          balance: portfolio.money.balance,
          freeCash: portfolio.money.freeCash,
          portfolioValue: portfolio.money.portfolioValue,
          dayPnl: portfolio.money.dayPnl,
          totalPnl: portfolio.money.totalPnl,
          cash: portfolio.money.cash,
          positions: portfolio.positions,
          settings,
          source: 'BCS API',
        });
      }
    } catch (err: any) {
      logger.warn(`ai_analysis_failed: portfolio_bcs: ${err?.message ?? err}`);
    }
  }
  return buildAiPortfolioLocalFallback(telegramId);
}

async function buildAiMarketAnalysis(): Promise<string> {
  const context = await withTimeout(buildAiMarketContext(), 3500, buildAiMarketFallbackContext(), 'ai_market_data');
  return analyzeMarket(context);
}

async function buildAiMarketContext() {
  const { snapshot, signals } = await scanMarket();
  const { instruments: gainers } = await getTopList('gainers');
  const { instruments: losers } = await getTopList('losers');
  const { instruments: volume } = await getTopList('volume');
  const context = { snapshot, signals, gainers, losers, volume };
  return { ...context, state: analyzeMarketState(context) };
}

function buildAiMarketFallbackContext() {
  const snapshot = { status: 'unknown' as const, instruments: [], updatedAt: new Date().toISOString(), source: 'cached/mock' as const, fallback: true };
  const context = { snapshot, signals: [], gainers: [], losers: [], volume: [] };
  logger.info('ai_analysis_fallback: market_state_local');
  return { ...context, state: analyzeMarketState(context) };
}

function buildAiMarketLocalFallback(): string {
  return fallbackMarketAnalysis(buildAiMarketFallbackContext());
}

async function buildAiRiskAnalysis(telegramId: string): Promise<string> {
  logger.info('ai_analysis_started: risk');
  const text = buildAiRiskLocalFallback(telegramId);
  logger.info('ai_analysis_finished: risk');
  return text;
}


function buildAiRiskLocalFallback(telegramId: string, warning = false): string {
  logger.info('ai_fallback_used: risk_local');
  const settings = getUserSettings(telegramId);
  const positions = getBcsPositions();
  const exposureRub = positions.reduce((sum, position) => sum + Number(position.currentPrice ?? 0) * Number(position.quantity ?? 0), 0);
  const exposureShare = settings.depositRub > 0 ? (exposureRub / settings.depositRub) * 100 : 0;
  const maxRiskRub = settings.depositRub * (settings.riskPerTrade / 100);
  return buildUiScreen('🧠 <b>AI-риск</b>', 'Локальный rule-based fallback', `${warning ? '⚠️ AI-анализ временно недоступен. Показываю базовую оценку.\n\n' : ''}Депозит: <b>${formatNumber(settings.depositRub)} ₽</b>
Риск на сделку: <b>${settings.riskPerTrade.toFixed(2)}%</b> ≈ <b>${formatNumber(maxRiskRub)} ₽</b>
Дневная просадка: <b>${settings.maxDailyLoss.toFixed(2)}%</b>
Макс. позиций: <b>${settings.maxOpenPositions}</b>

Exposure: <b>${formatNumber(exposureRub)} ₽</b> / <b>${exposureShare.toFixed(1)}%</b>
Execution mode: <b>${config.execution.mode}</b>
Read only: <b>${config.readOnlyMode ? 'true' : 'false'}</b>

Сценарий: контролировать размер позиции и ждать подтверждения условий входа.

⚠️ <i>Это не инвестиционная рекомендация.</i>`, new Date().toISOString(), false);
}

function buildAiDealPrompt(telegramId: string): string {
  textModes.set(telegramId, 'ai_deal');
  return buildUiScreen('🧠 <b>AI-разбор сделки</b>', 'BCS Assistant Bot', `Отправьте тикер и направление, например: <code>GAZP long</code>

Разбор оценит рыночный контекст, риск, примерный стоп, размер позиции и условия входа.`, new Date().toISOString(), false);
}

async function processAiDeal(chat: string, telegramId: string, text: string): Promise<void> {
  const [tickerRaw, directionRaw] = text.trim().split(/\s+/);
  const direction = directionRaw?.toLowerCase();
  if (!tickerRaw || (direction !== 'long' && direction !== 'short')) return send(chat, 'Отправьте тикер и направление, например: <code>GAZP long</code>');
  const snapshot = await withTimeout(getMarketSnapshot(), 3000, { status: 'unknown', instruments: [], updatedAt: new Date().toISOString(), source: 'cached/mock', fallback: true }, 'ai_deal_market');
  const ticker = tickerRaw.toUpperCase();
  const instrument = snapshot.instruments.find(item => item.ticker.toUpperCase() === ticker);
  const marketContext = { snapshot, signals: [], gainers: [], losers: [], volume: [] };
  await send(chat, await analyzeDeal({ ticker, direction, instrument, settings: getUserSettings(telegramId), marketStatus: snapshot.status, marketState: analyzeMarketState(marketContext) }));
}

async function buildMenuPortfolioScreen(telegramId: string): Promise<string> {
  if (config.bcsApi.enabled) {
    try {
      const portfolio = await bcsApiClient.getPortfolio();
      const moneyLines = formatCashBalances(portfolio.money.cash);
      const positionBlock = formatBcsPortfolioPositions(portfolio.positions, portfolio.money.cash.length > 0);
      const body = `Баланс: <b>${formatRub(portfolio.money.balance)}</b>
Свободные средства: <b>${formatRub(portfolio.money.freeCash)}</b>
Стоимость портфеля: <b>${formatRub(portfolio.money.portfolioValue)}</b>
Дневной P&L: <b>${formatRub(portfolio.money.dayPnl)}</b>
Общий P&L: <b>${formatRub(portfolio.money.totalPnl)}</b>

💰 <b>Деньги:</b>
${moneyLines}

${positionBlock}`;
      return buildUiScreen('📊 <b>Портфель</b>', 'BCS API', body, portfolio.updatedAt);
    } catch (err: any) {
      logger.warn(`Menu portfolio BCS fallback: ${err.message}`);
    }
  }

  const fallbackPrefix = config.bcsApi.enabled ? '⚠️ BCS API временно недоступен\nПоказываю локальные данные.\n\n' : '';
  const snapshot = getLatestBcsPortfolioSnapshot();
  const positions = getBcsPositions();
  if (snapshot) {
    const lines = positions.map(p => `• ${p.ticker}: ${p.quantity} шт. | тек. ${p.currentPrice.toFixed(2)} | P&L ${formatRub(p.unrealizedPnl)}`).join('\n') || 'нет данных';
    const body = `${fallbackPrefix}Баланс: <b>${formatRub(snapshot.balance)}</b>
Свободные средства: <b>${formatRub(snapshot.freeCash)}</b>
Стоимость портфеля: <b>${formatRub(snapshot.portfolioValue)}</b>
Дневной P&L: <b>${formatRub(snapshot.dayPnl)}</b>
Общий P&L: <b>${formatRub(snapshot.totalPnl)}</b>

Позиции:
${lines}`;
    return buildUiScreen('📊 <b>Портфель</b>', 'BCS API (последний sync)', body, snapshot.syncedAt ?? new Date().toISOString());
  }
  return buildUiScreen('📊 <b>Портфель</b>', 'Локальная база', `${fallbackPrefix}${buildPortfolio(telegramId)}`);
}

async function buildMenuLimitsScreen(telegramId: string): Promise<string> {
  if (!config.bcsApi.enabled) return buildUiScreen('💰 <b>Остатки</b>', 'BCS API', 'BCS API отключен.', new Date().toISOString(), false);
  try {
    const limits = await bcsApiClient.getLimits();
    const body = limits.cash.length ? formatCashBalances(limits.cash) : 'BCS API вернул limits, но денежные остатки не найдены. Выполните /debug_limits.';
    return buildUiScreen('💰 <b>Остатки</b>', 'BCS API limits', body, limits.updatedAt, false);
  } catch (err: any) {
    logger.warn(`Menu limits BCS fallback: ${err.message}`);
    return buildUiScreen('💰 <b>Остатки</b>', 'Локальные данные', `⚠️ BCS API временно недоступен
Показываю локальные данные.

${err.message}`, new Date().toISOString(), false);
  }
}

async function buildRealPortfolio(telegramId: string): Promise<string> {
  if (config.bcsApi.enabled) {
    try {
      const portfolio = await bcsApiClient.getPortfolio();
      const moneyLines = formatCashBalances(portfolio.money.cash);
      const positionBlock = formatBcsPortfolioPositions(portfolio.positions, portfolio.money.cash.length > 0);
      return `📊 <b>Реальный портфель</b>
Источник: <b>БКС API</b>

Баланс: <b>${formatRub(portfolio.money.balance)}</b>
Свободные средства: <b>${formatRub(portfolio.money.freeCash)}</b>
Стоимость портфеля: <b>${formatRub(portfolio.money.portfolioValue)}</b>
Дневной P&L: <b>${formatRub(portfolio.money.dayPnl)}</b>
Общий P&L: <b>${formatRub(portfolio.money.totalPnl)}</b>

💰 <b>Деньги:</b>
${moneyLines}

${positionBlock}

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
    } catch (err: any) {
      logger.warn(`Real portfolio fallback: ${err.message}`);
    }
  }
  const fallbackNotice = config.bcsApi.enabled ? '⚠️ BCS API временно недоступен\nПоказываю локальные данные.\n\n' : '';
  const snapshot = getLatestBcsPortfolioSnapshot();
  const positions = getBcsPositions();
  if (snapshot) {
    const lines = positions.map(p => `• ${p.ticker}: ${p.quantity} шт. | ср. ${p.averagePrice.toFixed(2)} | тек. ${p.currentPrice.toFixed(2)} | P&L ${formatRub(p.unrealizedPnl)} | доля ${p.portfolioSharePercent.toFixed(1)}%`).join('\n');
    return `${fallbackNotice}📊 <b>Реальный портфель</b>\nИсточник: <b>БКС API (последний sync)</b>\n\nБаланс: <b>${formatRub(snapshot.balance)}</b>\nСвободные средства: <b>${formatRub(snapshot.freeCash)}</b>\nСтоимость портфеля: <b>${formatRub(snapshot.portfolioValue)}</b>\nДневной P&L: <b>${formatRub(snapshot.dayPnl)}</b>\nОбщий P&L: <b>${formatRub(snapshot.totalPnl)}</b>\n\nПозиции:\n${lines || 'нет данных'}\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
  }
  return `${fallbackNotice}${buildApiStatus()}\n\n${buildPortfolio(telegramId)}`;
}


async function buildLimits(telegramId: string): Promise<string> {
  if (!config.bcsApi.enabled) return '💵 <b>Остатки</b>\n\nBCS API отключен.';
  try {
    const limits = await bcsApiClient.getLimits();
    if (!limits.cash.length) {
      const rawDebug = isAdminAllowed(telegramId) ? `\n\nRaw debug limits:\n<pre>${escapeHtml(limits.rawDebug).slice(0, 3500)}</pre>` : '';
      return `💵 <b>Остатки по счету</b>\nИсточник: <b>БКС API limits</b>\nОбновлено: <b>${limits.updatedAt}</b>\n\nBCS API вернул limits, но денежные остатки не найдены. Выполните /debug_limits.${rawDebug}`;
    }
    return `💵 <b>Остатки по счету</b>\nИсточник: <b>БКС API limits</b>\nОбновлено: <b>${limits.updatedAt}</b>\n\n${formatCashBalances(limits.cash)}`;
  } catch (err: any) {
    logger.warn(`BCS limits view failed: ${err.message}`);
    return `⚠️ BCS API временно недоступен\nПоказываю локальные данные.\n\n💵 <b>Остатки</b>\n${err.message}`;
  }
}

async function buildDebugLimits(telegramId: string): Promise<string> {
  if (!isAdminAllowed(telegramId)) return '⛔️ Команда /debug_limits доступна только администратору.';
  if (!config.bcsApi.enabled) return '🔎 <b>Debug limits</b>\n\nBCS API отключен.';
  try {
    const limits = await bcsApiClient.getLimits();
    return `🔎 <b>Debug limits</b>\nИсточник: <b>БКС API limits</b>\nОбновлено: <b>${limits.updatedAt}</b>\nParsed cash: <b>${limits.cash.length}</b>\n\n<pre>${escapeHtml(limits.rawDebug).slice(0, 3500)}</pre>`;
  } catch (err: any) {
    logger.warn(`BCS debug limits failed: ${err.message}`);
    return `🔎 <b>Debug limits</b>\n\n⚠️ BCS API временно недоступен.\n${err.message}`;
  }
}


async function buildDebugPortfolioText(telegramId: string): Promise<string> {
  if (!isAdminAllowed(telegramId)) return '⛔️ Команда /debug_portfolio доступна только администратору.';
  try {
    logger.info('BCS portfolio debug request started');
    const raw = await bcsApiClient.request<any>('GET', '/trade-api-bff-portfolio/api/v1/portfolio', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
    const debugJson = escapeHtml(buildRawDebug(raw)).slice(0, 3500);
    logger.info('BCS portfolio debug success');
    return `🔎 <b>Debug portfolio</b>
Источник: <b>БКС API portfolio</b>

<pre>${debugJson}</pre>`;
  } catch (err: any) {
    const message = sanitizeSecret(err?.message ?? err);
    logger.error(`BCS portfolio debug error: ${message}`);
    return `❌ Ошибка debug_portfolio: ${escapeHtml(message)}`;
  }
}


async function handleDebugPortfolio(chatIdValue: string, telegramId: string): Promise<void> {
  try {
    logger.info('Telegram command received: debug_portfolio');
    await bot.sendMessage(chatIdValue, '⏳ Запрашиваю portfolio из BCS API...');
    logger.info('BCS portfolio debug request started');
    const raw = await bcsApiClient.request<any>('GET', '/trade-api-bff-portfolio/api/v1/portfolio', undefined, config.bcsApi.accountId ? { accountId: config.bcsApi.accountId } : undefined);
    const debugJson = escapeHtml(buildRawDebug(raw)).slice(0, 3500);
    logger.info('BCS portfolio debug success');
    await bot.sendMessage(chatIdValue, `🔎 <b>Debug portfolio</b>\nИсточник: <b>БКС API portfolio</b>\n\n<pre>${debugJson}</pre>`, { parse_mode: 'HTML', disable_web_page_preview: true });
  } catch (err: any) {
    const message = sanitizeSecret(err?.message ?? err);
    logger.error(`BCS portfolio debug error: ${message}`);
    await bot.sendMessage(chatIdValue, `❌ Ошибка debug_portfolio: ${escapeHtml(message)}`, { parse_mode: 'HTML' }).catch(() => undefined);
  }
}


function formatBcsPortfolioPositions(positions: Array<{ ticker: string; name?: string; quantity: number; currentPrice: number; currentValueRub?: number; dailyPL?: number; dailyPercentPL?: number; unrealizedPL?: number; unrealizedPercentPL?: number; unrealizedPnl: number }>, hasMoney: boolean): string {
  if (!positions.length) return hasMoney ? 'Позиции: нет бумаг, только денежный остаток.' : 'Позиции:\nнет данных';
  return `Позиции:\n${positions.map(position => [
    `• ${position.ticker}${position.name ? ` — ${position.name}` : ''}`,
    `  Кол-во: ${formatNumber(position.quantity)}`,
    `  Цена: ${formatRub(position.currentPrice)}`,
    `  Стоимость: ${formatRub(position.currentValueRub ?? position.currentPrice * position.quantity)}`,
    `  День: ${formatRub(position.dailyPL ?? 0)} / ${formatPercent(position.dailyPercentPL ?? 0)}`,
    `  P&L: ${formatRub(position.unrealizedPL ?? position.unrealizedPnl)} / ${formatPercent(position.unrealizedPercentPL ?? 0)}`,
  ].join('\n')).join('\n')}`;
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatCashBalances(cash: Array<{ currency: string; available: number; blocked: number; total: number }>, includeMajorCurrencies = false): string {
  if (!cash.length && !includeMajorCurrencies) return 'нет данных';
  const byCurrency = new Map(cash.map(item => [item.currency, item]));
  const currencies = includeMajorCurrencies ? ['RUB', 'USD', 'EUR', 'CNY'] : cash.map(item => item.currency);
  return currencies.map(currency => {
    const item = byCurrency.get(currency);
    if (!item) return `• ${currency}: свободно <b>нет данных</b> / заблокировано <b>нет данных</b> / всего <b>нет данных</b>`;
    return `• ${item.currency}: свободно <b>${formatNumber(item.available)}</b> / заблокировано <b>${formatNumber(item.blocked)}</b> / всего <b>${formatNumber(item.total)}</b>`;
  }).join('\n');
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildUiScreen(title: string, source: string, body: string, updatedAt = new Date().toISOString(), showDisclaimer = true): string {
  return `${title}
━━━━━━━━━━━━━━
Источник: <b>${source}</b>
Обновлено: <b>${updatedAt}</b>
━━━━━━━━━━━━━━

${body}${showDisclaimer ? '\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>' : ''}`;
}

function buildSectionInDevelopment(): string {
  return buildUiScreen('🚧 <b>Раздел в разработке</b>', 'BCS Assistant Bot', '🚧 Раздел в разработке', new Date().toISOString(), false);
}

function buildSubmenuScreen(title: string, body: string): string {
  return buildUiScreen(title, 'BCS Assistant Bot', `${body}

Выберите действие кнопками ниже.`, new Date().toISOString(), false);
}

function buildAiSectionInDevelopment(): string {
  return buildUiScreen('🧠 <b>AI Анализ</b>', 'BCS Assistant Bot', '🚧 Раздел в разработке', new Date().toISOString(), false);
}

function buildSettingsActionScreen(command: string, telegramId: string): string {
  const modeMap: Record<string, 'set_deposit' | 'set_risk' | 'set_daily_loss' | 'set_max_positions' | 'set_tariff'> = {
    '/set_deposit': 'set_deposit',
    '/set_risk': 'set_risk',
    '/set_daily_loss': 'set_daily_loss',
    '/set_max_positions': 'set_max_positions',
    '/set_tariff': 'set_tariff',
  };
  const labels: Record<string, string> = {
    '/set_deposit': '💵 <b>Депозит</b>',
    '/set_risk': '📉 <b>Риск %</b>',
    '/set_daily_loss': '📉 <b>Дневная просадка</b>',
    '/set_max_positions': '🔢 <b>Макс. позиций</b>',
    '/set_tariff': '💸 <b>Тариф комиссии</b>',
  };
  const mode = modeMap[command];
  if (mode) textModes.set(telegramId, mode);
  return buildUiScreen(labels[command] ?? '⚙️ <b>Настройка</b>', 'Локальные настройки', `Введите новое значение следующим сообщением.

Для отмены вернитесь кнопкой ⬅️ Назад или 🏠 Главное меню.`, new Date().toISOString(), false);
}

function buildHelp(): string {
  return `ℹ️ <b>Помощь</b>

<b>Основные разделы</b>
• 📊 <code>/portfolio</code> — портфель BCS
• 💰 <code>/limits</code> — денежные остатки
• 🔎 <code>/debug_limits</code> — debug остатков
• 🔎 <code>/debug_portfolio</code> — debug портфеля
• 🧭 <code>/menu</code> — главное меню

🔒 Автоторговля отключена. Бот работает в режиме безопасного мониторинга.

⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}

function buildPaperModeStatus(): string {
  const body = `Execution mode: <b>${config.execution.mode}</b>\nPaper active: <b>${config.execution.mode === 'paper' ? '✅ yes' : '❌ no'}</b>\nPaper engine учитывает LIMIT price, spread, slippage и комиссии.`;
  return buildUiScreen('🤖 <b>Paper mode</b>', 'Execution config', body, new Date().toISOString(), false);
}

function buildExecutionStatus(): string {
  const emergency = getEmergencyStopStatus();
  const body = `Execution: <b>${config.execution.mode}</b>\nOrder execution: <b>${config.allowOrderExecution ? 'ENABLED' : 'DISABLED'}</b>\nRead only: <b>${config.readOnlyMode ? 'ENABLED' : 'DISABLED'}</b>\nEmergency stop: <b>${emergency.stopped ? 'ON' : 'OFF'}</b>\nAllowed symbols: <code>${config.execution.allowedSymbols.join(', ')}</code>\n\nMarket orders are disabled. Only LIMIT orders can pass validation.`;
  return buildUiScreen('⚡ <b>Execution status</b>', 'Execution config', body, new Date().toISOString(), false);
}

function buildRiskStatus(telegramId: string): string {
  const open = getOpenTrades(telegramId).length;
  const body = `MAX_POSITION_PERCENT: <b>${config.execution.maxPositionPercent}%</b>\nMAX_DAILY_LOSS_PERCENT: <b>${config.execution.maxDailyLossPercent}%</b>\nMAX_OPEN_POSITIONS: <b>${config.execution.maxOpenPositions}</b>\nOpen local positions: <b>${open}</b>\nRR minimum: <b>1.5</b>`;
  return buildUiScreen('⚠️ <b>Risk status</b>', 'Execution config + локальная база', body, new Date().toISOString(), false);
}

function buildEmergencyStopStatus(): string {
  const status = getEmergencyStopStatus();
  const body = `Enabled: <b>${status.enabled ? 'YES' : 'NO'}</b>\nStatus: <b>${status.stopped ? 'ON' : 'OFF'}</b>\nReason: <b>${status.reason || '—'}</b>\nAPI errors: <b>${status.apiErrors}</b>\nRejects: <b>${status.rejects}</b>\n\nAlert text: 🚨 Trading stopped by emergency system`;
  return buildUiScreen('🚨 <b>Emergency stop</b>', 'Execution safety', body, new Date().toISOString(), false);
}


function isAdminAllowed(telegramId: string): boolean {
  return !config.telegram.adminId || telegramId === config.telegram.adminId;
}

function maskAccountId(accountId: string): string {
  if (!accountId) return 'missing';
  if (accountId.length <= 4) return `${accountId.slice(0, 1)}***`;
  return `${accountId.slice(0, 4)}****`;
}

function buildApiStatus(): string {
  const status = bcsApiClient.getStatus();
  const snapshot = getLatestBcsPortfolioSnapshot();
  const lastSync = status.lastSyncAt ?? snapshot?.syncedAt ?? 'нет данных';
  const lastPing = status.lastPingAt ?? status.lastCheckedAt ?? 'нет данных';
  const body = `API enabled: <b>${config.bcsApi.enabled ? 'true' : 'false'}</b>
Token: <b>${config.bcsApi.token ? 'present' : 'missing'}</b>
Account: <code>${maskAccountId(config.bcsApi.accountId)}</code>
Read only: <b>${config.readOnlyMode ? 'enabled' : 'disabled'}</b>
Order execution: <b>${config.allowOrderExecution && !config.readOnlyMode ? 'enabled' : 'disabled'}</b>
Execution mode: <b>${config.execution.mode}</b>
Last ping: <b>${lastPing}</b>
Last sync: <b>${lastSync}</b>
Last error: <code>${status.lastError ?? '—'}</code>

Токен не выводится и не логируется.`;
  return buildUiScreen('🔌 <b>Статус BCS API</b>', 'BCS Assistant Bot', body, new Date().toISOString(), false);
}

function buildPortfolio(telegramId: string): string {
  const settings = getUserSettings(telegramId);
  const positions = getPositions(telegramId);
  const closed = getLastNTrades(200, telegramId);
  const pnl = closed.reduce((sum, t) => sum + t.pnl, 0);
  const commissions = closed.reduce((sum, t) => sum + t.commission, 0);
  return `📊 <b>Портфель</b>\n\nДепозит: <b>${settings.depositRub.toFixed(2)} ₽</b>\nОткрытые позиции: <b>${positions.length}</b>\nP&L закрытых сделок: <b>${formatRub(pnl)}</b>\nКомиссии: <b>${commissions.toFixed(2)} ₽</b>\n\n${positions.length ? positions.map(p => `• ${p.ticker} ${p.direction} qty ${p.quantity} @ ${p.avgEntryPrice}`).join('\n') : 'Открытых позиций нет.'}`;
}

function buildRiskManagement(telegramId: string): string {
  const s = getUserSettings(telegramId);
  const body = `Депозит: <b>${s.depositRub.toFixed(2)} ₽</b>
Риск на сделку: <b>${s.riskPerTrade.toFixed(2)}%</b>
Макс. дневная просадка: <b>${s.maxDailyLoss.toFixed(2)}%</b>
Макс. открытых позиций: <b>${s.maxOpenPositions}</b>

Если риска нет, стопа нет или RR ниже 1.5 — сделку лучше не сохранять.`;
  return buildUiScreen('⚠️ <b>Риск-менеджмент</b>', 'Локальные настройки', body);
}

function buildCommissions(telegramId: string): string {
  const fee = getBrokerFee(ensureUser(telegramId).id);
  return `💰 <b>Комиссии БКС</b>\n\nТариф: ${fee.tariffName}\nАкции/фонды/облигации: ${fee.stockFeePercent}% от оборота\nВалюта: ${fee.currencyFeePercent}% от оборота\nДоп. комиссия покупки USD/EUR/HKD/GBP: ${fee.extraCurrencyBuyFeePercent}%\nФьючерсы: ${fee.futuresFeePerContract} ₽ за контракт\nОпционы: не более 1% от объема сделки.`;
}

function buildDiary(telegramId: string): string {
  const trades = [...getOpenTrades(telegramId), ...getLastNTrades(15, telegramId)];
  const body = trades.length ? trades.map(t => `• #${t.id} ${t.ticker} ${t.direction} ${t.status} | RR 1:${t.rr.toFixed(2)} | P&L ${formatRub(t.pnl)}`).join('\n') : 'Дневник сделок пуст.';
  return buildUiScreen('📋 <b>Дневник сделок</b>', 'Локальная база', body);
}

function buildReport(telegramId: string, period: 'day' | 'month'): string {
  const trades = period === 'day' ? getTodayTrades(telegramId) : getMonthTrades(telegramId);
  const open = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => t.pnl > 0);
  const pnl = closed.reduce((sum, t) => sum + t.pnl, 0);
  const commissions = trades.reduce((sum, t) => sum + t.commission, 0);
  const winrate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const avgRr = trades.length ? trades.reduce((sum, t) => sum + t.rr, 0) / trades.length : 0;
  const best = [...closed].sort((a, b) => b.pnl - a.pnl).slice(0, 3);
  const worst = [...closed].sort((a, b) => a.pnl - b.pnl).slice(0, 3);
  const bySymbol = getWinrateBySymbol(telegramId);
  const body = `Открытые позиции: <b>${open.length}</b>
Закрытые сделки: <b>${closed.length}</b>
P&L: <b>${formatRub(pnl)}</b>
Комиссии: <b>${commissions.toFixed(2)} ₽</b>
Winrate: <b>${winrate.toFixed(1)}%</b>
${period === 'month' ? `Средний RR: <b>1:${avgRr.toFixed(2)}</b>
Лучшие инструменты: ${bySymbol.slice(0, 3).map(x => x.symbol).join(', ') || 'нет данных'}
Худшие инструменты: ${bySymbol.slice(-3).map(x => x.symbol).join(', ') || 'нет данных'}
Частые ошибки: высокий риск, слабый RR, вход без плана.
` : ''}
Лучшие сделки:
${best.length ? best.map(t => `• #${t.id} ${t.ticker}: ${formatRub(t.pnl)}`).join('\n') : 'нет данных'}

Худшие сделки:
${worst.length ? worst.map(t => `• #${t.id} ${t.ticker}: ${formatRub(t.pnl)}`).join('\n') : 'нет данных'}`;
  return buildUiScreen(period === 'day' ? '📅 <b>Дневной отчет</b>' : '📆 <b>Отчет за месяц</b>', 'Локальная база сделок', body);
}


function buildSettingsScreen(telegramId: string): string {
  const s = getUserSettings(telegramId);
  const fee = getBrokerFee(s.userId);
  const body = `Депозит: <b>${s.depositRub.toFixed(2)} ₽</b>
Риск на сделку: <b>${s.riskPerTrade.toFixed(2)}%</b>
Макс. дневная просадка: <b>${s.maxDailyLoss.toFixed(2)}%</b>
Макс. открытых позиций: <b>${s.maxOpenPositions}</b>

Тариф комиссии: <b>${fee.tariffName}</b>
Акции: <b>${fee.stockFeePercent}%</b>
Инструменты: <code>${getInstruments().map(i => i.ticker).join(', ')}</code>`;
  return buildUiScreen('⚙️ <b>Настройки</b>', 'Локальные настройки', body, new Date().toISOString(), false);
}

async function sendSettings(chat: string, telegramId: string): Promise<void> {
  const s = getUserSettings(telegramId);
  const fee = getBrokerFee(s.userId);
  await bot.sendMessage(chat, `⚙️ <b>Настройки</b>\n\nДепозит: ${s.depositRub.toFixed(2)} ₽\nРиск на сделку: ${s.riskPerTrade.toFixed(2)}%\nМакс. дневная просадка: ${s.maxDailyLoss.toFixed(2)}%\nМакс. открытых позиций: ${s.maxOpenPositions}\nТариф комиссии: ${fee.tariffName}, акции ${fee.stockFeePercent}%\nИнструменты: ${getInstruments().map(i => i.ticker).join(', ')}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
    [{ text: 'Депозит', callback_data: 'settings:deposit' }, { text: 'Риск %', callback_data: 'settings:risk' }],
    [{ text: 'Дневная просадка', callback_data: 'settings:daily_loss' }, { text: 'Макс. позиций', callback_data: 'settings:max_positions' }],
    [{ text: 'Тариф комиссии (акции %)', callback_data: 'settings:tariff' }],
  ] } });
}

async function handleSettingsCallback(query: TelegramBot.CallbackQuery): Promise<void> {
  await bot.answerCallbackQuery(query.id, { text: 'OK' });
  const telegramId = query.from.id.toString();
  const chat = query.message?.chat.id.toString() ?? telegramId;
  const modeMap: Record<string, any> = { 'settings:deposit': 'set_deposit', 'settings:risk': 'set_risk', 'settings:daily_loss': 'set_daily_loss', 'settings:max_positions': 'set_max_positions', 'settings:tariff': 'set_tariff' };
  const mode = modeMap[query.data ?? ''];
  if (mode) textModes.set(telegramId, mode);
  await send(chat, 'Введите новое значение:');
}

async function handleTradeDetails(chat: string, id: number): Promise<void> {
  if (!id) return send(chat, 'Укажите ID сделки: /trade 123');
  const t = getTradeById(id);
  await send(chat, t ? `🧾 <b>Сделка #${t.id}</b>\n\n${t.ticker} ${t.direction}\nВход: ${t.entryPrice}\nСтоп: ${t.stopLoss}\nТейк: ${t.takeProfit}\nКомиссия: ${t.commission}\nКомментарий: ${t.comment ?? '—'}\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>` : `Сделка #${id} не найдена.`);
}

function parseTradeLine(telegramId: string, text: string): Partial<TradeInput> | null {
  const user = ensureUser(telegramId);
  const parts = text.trim().split(/\s+/);
  if (parts.length < 7) return null;
  const [ticker, type, direction, entry, qty, stop, take] = parts;
  const instrumentType = normalizeType(type);
  if (!instrumentType || (direction !== 'LONG' && direction !== 'SHORT')) return null;
  return { userId: user.id, ticker: ticker.toUpperCase(), instrumentType, direction, entryPrice: Number(entry), quantity: Number(qty), stopLoss: Number(stop), takeProfit: Number(take), commission: 0, comment: parts.slice(7).join(' ') };
}

function normalizeType(value: string): InstrumentType | null {
  const v = value.toLowerCase();
  if (['stock', 'акция'].includes(v)) return 'stock';
  if (['future', 'фьючерс'].includes(v)) return 'future';
  if (['currency', 'валюта'].includes(v)) return 'currency';
  if (['bond', 'облигация'].includes(v)) return 'bond';
  if (['fund', 'фонд'].includes(v)) return 'fund';
  return null;
}

function normalizeSupportedTicker(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace('\\', '/');
  if (normalized === 'SI') return 'Si';
  if (SUPPORTED_INSTRUMENTS.has(normalized)) return normalized;
  return null;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatRub(value: number): string { return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ₽`; }
function chatId(msg: TelegramBot.Message): string { return msg.chat.id.toString(); }
function fromId(msg: TelegramBot.Message): string { return msg.from?.id.toString() ?? msg.chat.id.toString(); }
function escapeHtml(value: string): string { return value.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] ?? ch)); }
async function send(chat: string, text: string): Promise<void> { await bot.sendMessage(chat, text, { parse_mode: 'HTML', disable_web_page_preview: true }); }

export async function broadcastMessage(text: string): Promise<void> { const target = config.telegram.chatId || config.telegram.adminId; if (target) await send(target, text); }
export async function sendAdminMessage(text: string): Promise<void> { if (config.telegram.adminId) await send(config.telegram.adminId, text); }
export async function sendErrorAlert(error: string): Promise<void> { if (config.telegram.adminId) await send(config.telegram.adminId, `⚠️ ${error}`); }
