import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger';

export const callbacks: Record<string, string> = {
  portfolio: '/submenu_portfolio',
  portfolio_menu: '/submenu_portfolio',
  market_menu: '/submenu_market',
  ai_menu: '/submenu_ai',
  risk_menu: '/submenu_risk',
  reports_menu: '/submenu_reports',
  settings_menu: '/submenu_settings',

  real_portfolio: '/portfolio',
  limits: '/limits',
  api_status: '/api_status',
  debug_menu: '/submenu_debug',
  debug_limits: '/debug_limits',
  debug_portfolio: '/debug_portfolio',

  market: '/market',
  market_overview: '/market',
  scanner: '/scanner',
  market_scanner: '/scanner',
  top_gainers: '/top_gainers',
  market_top_gainers: '/top_gainers',
  top_losers: '/top_losers',
  market_top_losers: '/top_losers',
  top_volume: '/top_volume',
  market_top_volume: '/top_volume',
  market_refresh: '/market',

  ai_analysis: '/ai_analysis',
  news: '/ai_market',
  ai_portfolio: '/ai_portfolio',
  ai_deal: '/ai_deal',
  ai_trade: '/ai_deal',
  ai_risk: '/ai_risk',
  ai_market: '/ai_market',
  ai_market_summary: '/ai_market',

  risk: '/submenu_risk',
  risk_status: '/risk_status',
  paper_mode: '/paper',
  execution_mode: '/execution',
  emergency_stop: '/emergency_stop',
  risk_settings: '/risk',

  diary_menu: '/journal',
  diary: '/journal',
  daily_report_menu: '/daily_report',
  daily_report: '/daily_report',
  monthly_report: '/monthly_report',
  commissions: '/commissions',
  export: '/export',

  settings: '/settings',
  set_deposit: '/set_deposit',
  set_risk: '/set_risk',
  set_daily_loss: '/set_daily_loss',
  set_max_positions: '/set_max_positions',
  set_tariff: '/set_tariff',
  watchlist: '/watchlist',
  help: '/help',

  menu_back_portfolio: '/submenu_portfolio',
  menu_back_market: '/submenu_market',
  menu_back_ai: '/submenu_ai',
  menu_back_risk: '/submenu_risk',
  menu_back_reports: '/submenu_reports',
  menu_back_settings: '/submenu_settings',
  menu_back_main: '/menu',
  menu_back: '/menu',
  menu_home: '/menu',
};

type CommandHandler = (chatId: string, command: string, fromId?: string, menuMessageId?: number) => Promise<void>;
let commandHandler: CommandHandler | undefined;

export function setAdminCommandHandler(handler: CommandHandler): void {
  commandHandler = handler;
}

export function getMainKeyboard(): TelegramBot.SendMessageOptions['reply_markup'] {
  return {
    inline_keyboard: [
      [{ text: '📊 Портфель', callback_data: 'portfolio_menu' }, { text: '📈 Рынок', callback_data: 'market_menu' }],
      [{ text: '🧠 AI Анализ', callback_data: 'ai_menu' }, { text: '⚠️ Риск', callback_data: 'risk_menu' }],
      [{ text: '📋 Отчеты', callback_data: 'reports_menu' }, { text: '⚙️ Настройки', callback_data: 'settings_menu' }],
    ],
  };
}

export function getMenuKeyboard(command: string): TelegramBot.SendMessageOptions['reply_markup'] {
  if (command === '/menu') return getMainKeyboard();
  if (command === '/submenu_portfolio') return withHome([
    [{ text: '📊 Реальный портфель', callback_data: 'real_portfolio' }, { text: '💰 Остатки', callback_data: 'limits' }],
    [{ text: '🔌 Статус BCS API', callback_data: 'api_status' }, { text: '🧪 Debug', callback_data: 'debug_menu' }],
  ]);
  if (command === '/submenu_debug') return withBackHome('portfolio', [
    [{ text: '🔎 Debug limits', callback_data: 'debug_limits' }, { text: '🔎 Debug portfolio', callback_data: 'debug_portfolio' }],
  ]);
  if (['/portfolio', '/limits', '/api_status', '/debug_limits', '/debug_portfolio'].includes(command)) return getBackHomeKeyboard('portfolio');

  if (command === '/submenu_market') return withHome([
    [{ text: '📈 Обзор MOEX', callback_data: 'market_overview' }, { text: '🔥 Scanner', callback_data: 'market_scanner' }],
    [{ text: '🟢 Лидеры роста', callback_data: 'market_top_gainers' }, { text: '🔴 Лидеры падения', callback_data: 'market_top_losers' }],
    [{ text: '📊 Объемы', callback_data: 'market_top_volume' }],
  ]);
  if (['/market', '/scanner', '/top_gainers', '/top_losers', '/top_volume'].includes(command)) return withBackHome('market', [[{ text: '🔄 Обновить', callback_data: 'market_refresh' }]]);

  if (command === '/submenu_ai') return withHome([
    [{ text: '🧠 AI-разбор портфеля', callback_data: 'ai_portfolio' }, { text: '📈 AI-сводка рынка', callback_data: 'ai_market' }],
    [{ text: '⚠️ AI-риск', callback_data: 'ai_risk' }, { text: '📈 AI-разбор сделки', callback_data: 'ai_deal' }],
  ]);
  if (['/ai_analysis', '/ai_portfolio', '/ai_deal', '/ai_trade', '/ai_risk', '/ai_market', '/ai_market_summary'].includes(command)) return withBackHome('ai', [[{ text: '🔄 Обновить', callback_data: command === '/ai_market' || command === '/ai_market_summary' ? 'ai_market' : command === '/ai_risk' ? 'ai_risk' : command === '/ai_deal' || command === '/ai_trade' ? 'ai_deal' : 'ai_portfolio' }]]);

  if (command === '/submenu_risk') return withHome([
    [{ text: '⚠️ Статус риска', callback_data: 'risk_status' }, { text: '🧪 Тестовый режим', callback_data: 'paper_mode' }],
    [{ text: '⚡ Режим заявок', callback_data: 'execution_mode' }, { text: '🛡 Настройки риска', callback_data: 'risk_settings' }],
    [{ text: '🚨 Аварийная остановка', callback_data: 'emergency_stop' }],
  ]);
  if (['/risk_status', '/paper', '/paper_mode', '/execution', '/execution_mode', '/emergency_stop', '/risk'].includes(command)) return getBackHomeKeyboard('risk');

  if (command === '/submenu_reports') return withHome([
    [{ text: '📋 Дневник сделок', callback_data: 'diary' }, { text: '📅 Отчет за день', callback_data: 'daily_report' }],
    [{ text: '🗓 Отчет за месяц', callback_data: 'monthly_report' }, { text: '💸 Комиссии БКС', callback_data: 'commissions' }],
    [{ text: '📤 Экспорт', callback_data: 'export' }],
  ]);
  if (['/journal', '/diary', '/daily_report', '/monthly_report', '/commissions', '/export'].includes(command)) return getBackHomeKeyboard('reports');

  if (command === '/submenu_settings') return withHome([
    [{ text: '💵 Плановый капитал', callback_data: 'set_deposit' }, { text: '📉 Риск %', callback_data: 'set_risk' }],
    [{ text: '📉 Дневной лимит', callback_data: 'set_daily_loss' }, { text: '🔢 Максимум позиций', callback_data: 'set_max_positions' }],
    [{ text: '💸 Тариф комиссии', callback_data: 'set_tariff' }, { text: '📌 Watchlist', callback_data: 'watchlist' }],
    [{ text: 'ℹ️ Помощь', callback_data: 'help' }],
  ]);
  if (['/settings', '/set_deposit', '/set_risk', '/set_daily_loss', '/set_max_positions', '/set_tariff', '/watchlist', '/help'].includes(command)) return getBackHomeKeyboard('settings');

  return getBackHomeKeyboard('main');
}

export function getNavigationKeyboard(): TelegramBot.SendMessageOptions['reply_markup'] {
  return getBackHomeKeyboard('main');
}

function withHome(rows: Array<Array<{ text: string; callback_data: string }>>): TelegramBot.SendMessageOptions['reply_markup'] {
  return { inline_keyboard: [...rows, [{ text: '⬅️ Назад', callback_data: 'menu_back_main' }, { text: '🏠 Главное меню', callback_data: 'menu_home' }]] };
}

function withBackHome(parent: string, rows: Array<Array<{ text: string; callback_data: string }>>): TelegramBot.SendMessageOptions['reply_markup'] {
  return { inline_keyboard: [...rows, [{ text: '⬅️ Назад', callback_data: `menu_back_${parent}` }, { text: '🏠 Главное меню', callback_data: 'menu_home' }]] };
}

function getBackHomeKeyboard(parent: string): TelegramBot.SendMessageOptions['reply_markup'] {
  return withBackHome(parent, []);
}

export async function handleMenuCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery): Promise<boolean> {
  if (!query.data || !query.message) return false;
  logger.info(`callback_received: ${query.data}`);
  const command = callbacks[query.data];
  if (!command || !commandHandler) {
    logger.warn(`callback_unknown: ${query.data}`);
    await bot.answerCallbackQuery(query.id, { text: 'Неизвестная кнопка' }).catch(() => undefined);
    await renderUnknownCallback(bot, query.message);
    return true;
  }

  logger.info(`button_clicked: ${query.data}`);
  logger.info(`button_action_started: ${query.data}`);
  if (query.data.startsWith('menu_back')) logger.info(`navigation_back: ${query.data}`);
  if (query.data === 'menu_home') logger.info('navigation_home');
  if (command.startsWith('/submenu_')) logger.info(`submenu_opened: ${command}`);
  logger.info(`menu_navigation: ${query.data} -> ${command}`);
  await bot.answerCallbackQuery(query.id, { text: 'OK' });
  try {
    await commandHandler(query.message.chat.id.toString(), command, query.from.id.toString(), query.message.message_id);
    logger.info(`callback_handled: ${query.data}`);
  } catch (err: any) {
    logger.error(`button_action_failed: ${query.data}: ${err?.message ?? err}`);
    throw err;
  }
  return true;
}

async function renderUnknownCallback(bot: TelegramBot, message: TelegramBot.Message): Promise<void> {
  const text = `⚠️ <b>Неизвестная кнопка.</b>

Вернитесь в главное меню.`;
  try {
    await bot.editMessageText(text, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: 'HTML',
      reply_markup: getMainKeyboard(),
      disable_web_page_preview: true,
    });
  } catch (err: any) {
    logger.warn(`button_action_failed: unknown_callback_render: ${err?.message ?? err}`);
    await bot.sendMessage(message.chat.id, text, { parse_mode: 'HTML', reply_markup: getMainKeyboard(), disable_web_page_preview: true });
  }
}
