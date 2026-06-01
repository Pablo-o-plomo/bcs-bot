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
  scanner: '/scanner',
  top_gainers: '/top_gainers',
  top_losers: '/top_losers',
  top_volume: '/top_volume',

  ai_analysis: '/ai_analysis',
  news: '/ai_market_summary',
  ai_portfolio: '/ai_portfolio',
  ai_trade: '/ai_trade',
  ai_risk: '/ai_risk',
  ai_market_summary: '/ai_market_summary',

  risk: '/submenu_risk',
  risk_status: '/risk_status',
  paper_mode: '/paper_mode',
  execution_mode: '/execution_mode',
  emergency_stop: '/emergency_stop',
  risk_settings: '/risk',

  diary_menu: '/diary',
  diary: '/diary',
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
    [{ text: '📈 Обзор MOEX', callback_data: 'market' }, { text: '🔥 Scanner', callback_data: 'scanner' }],
    [{ text: '🟢 Лидеры роста', callback_data: 'top_gainers' }, { text: '🔴 Лидеры падения', callback_data: 'top_losers' }],
    [{ text: '📊 Объемы', callback_data: 'top_volume' }],
  ]);
  if (['/market', '/scanner', '/top_gainers', '/top_losers', '/top_volume'].includes(command)) return getBackHomeKeyboard('market');

  if (command === '/submenu_ai') return withHome([
    [{ text: '🧠 AI-разбор портфеля', callback_data: 'ai_portfolio' }],
    [{ text: '📈 AI-разбор сделки', callback_data: 'ai_trade' }, { text: '⚠️ AI-риск', callback_data: 'ai_risk' }],
    [{ text: '📰 AI-сводка рынка', callback_data: 'ai_market_summary' }],
  ]);
  if (['/ai_analysis', '/ai_portfolio', '/ai_trade', '/ai_risk', '/ai_market_summary'].includes(command)) return getBackHomeKeyboard('ai');

  if (command === '/submenu_risk') return withHome([
    [{ text: '⚠️ Risk status', callback_data: 'risk_status' }, { text: '🤖 Paper mode', callback_data: 'paper_mode' }],
    [{ text: '⚡ Execution mode', callback_data: 'execution_mode' }, { text: '🛡 Risk settings', callback_data: 'risk_settings' }],
    [{ text: '🚨 Emergency stop', callback_data: 'emergency_stop' }],
  ]);
  if (['/risk_status', '/paper_mode', '/execution_mode', '/emergency_stop', '/risk'].includes(command)) return getBackHomeKeyboard('risk');

  if (command === '/submenu_reports') return withHome([
    [{ text: '📋 Дневник сделок', callback_data: 'diary' }, { text: '📅 Отчет за день', callback_data: 'daily_report' }],
    [{ text: '🗓 Отчет за месяц', callback_data: 'monthly_report' }, { text: '💸 Комиссии БКС', callback_data: 'commissions' }],
    [{ text: '📤 Экспорт', callback_data: 'export' }],
  ]);
  if (['/diary', '/daily_report', '/monthly_report', '/commissions', '/export'].includes(command)) return getBackHomeKeyboard('reports');

  if (command === '/submenu_settings') return withHome([
    [{ text: '💵 Депозит', callback_data: 'set_deposit' }, { text: '📉 Риск %', callback_data: 'set_risk' }],
    [{ text: '📉 Дневная просадка', callback_data: 'set_daily_loss' }, { text: '🔢 Макс. позиций', callback_data: 'set_max_positions' }],
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
  const command = callbacks[query.data];
  if (!command || !commandHandler) return false;
  logger.info(`button_clicked: ${query.data}`);
  if (query.data.startsWith('menu_back')) logger.info(`navigation_back: ${query.data}`);
  if (query.data === 'menu_home') logger.info('navigation_home');
  if (command.startsWith('/submenu_')) logger.info(`submenu_opened: ${command}`);
  logger.info(`menu_navigation: ${query.data} -> ${command}`);
  await bot.answerCallbackQuery(query.id, { text: 'OK' });
  await commandHandler(query.message.chat.id.toString(), command, query.from.id.toString(), query.message.message_id);
  return true;
}
