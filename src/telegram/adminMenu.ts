import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger';

export const callbacks: Record<string, string> = {
  portfolio: '/portfolio',
  portfolio_menu: '/portfolio',
  ai_signal: '/ai_signal',
  market_menu: '/market',
  settings_menu: '/settings',

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

  ai_analysis: '/ai_signal',
  ai_menu: '/ai_signal',
  news: '/ai_market',
  ai_portfolio: '/ai_portfolio',
  ai_deal: '/ai_deal',
  ai_trade: '/ai_deal',
  ai_risk: '/ai_risk',
  ai_market: '/ai_market',
  ai_market_summary: '/ai_market',
  signal_enter: '/signal_enter',
  signal_skip: '/signal_skip',

  risk: '/risk',
  risk_menu: '/risk',
  risk_status: '/risk_status',
  paper_mode: '/paper',
  execution_mode: '/execution',
  emergency_stop: '/emergency_stop',
  risk_settings: '/risk',

  reports_menu: '/journal',
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

  menu_back_portfolio: '/portfolio',
  menu_back_market: '/market',
  menu_back_ai: '/ai_signal',
  menu_back_risk: '/settings',
  menu_back_reports: '/settings',
  menu_back_settings: '/settings',
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
      [{ text: '💼 Портфель', callback_data: 'portfolio_menu' }, { text: '📡 AI Сигнал', callback_data: 'ai_signal' }],
      [{ text: '📈 Рынок', callback_data: 'market_menu' }, { text: '⚙️ Настройки', callback_data: 'settings_menu' }],
    ],
  };
}

export function getMenuKeyboard(command: string): TelegramBot.SendMessageOptions['reply_markup'] {
  if (command === '/menu') return getMainKeyboard();
  if (command === '/ai_signal') return {
    inline_keyboard: [
      [{ text: '✅ Войти', callback_data: 'signal_enter' }, { text: '❌ Пропустить', callback_data: 'signal_skip' }],
      [{ text: '🔄 Новый сигнал', callback_data: 'ai_signal' }, { text: '🏠 Главное меню', callback_data: 'menu_home' }],
    ],
  };
  if (command === '/settings') return {
    inline_keyboard: [
      [{ text: '📉 Риск', callback_data: 'set_risk' }, { text: '💵 Плановый капитал', callback_data: 'set_deposit' }],
      [{ text: '⚡ Режим', callback_data: 'execution_mode' }, { text: '🔌 API', callback_data: 'api_status' }],
      [{ text: '🏠 Главное меню', callback_data: 'menu_home' }],
    ],
  };
  if (command === '/market') return withHome([[{ text: '🔄 Обновить', callback_data: 'market_refresh' }, { text: '📡 AI Сигнал', callback_data: 'ai_signal' }]]);
  if (command === '/portfolio') return withHome([[{ text: '🔄 Обновить', callback_data: 'real_portfolio' }, { text: '📡 AI Сигнал', callback_data: 'ai_signal' }]]);
  if (['/signal_enter', '/signal_skip'].includes(command)) return withHome([[{ text: '📡 Новый сигнал', callback_data: 'ai_signal' }]]);
  if (['/set_deposit', '/set_risk', '/execution', '/execution_mode', '/api_status'].includes(command)) return withBackHome('settings');

  // Legacy hidden flows remain available through commands/callback aliases, but not from the main UI.
  if (command === '/submenu_debug') return withBackHome('portfolio', [
    [{ text: '🔎 Debug limits', callback_data: 'debug_limits' }, { text: '🔎 Debug portfolio', callback_data: 'debug_portfolio' }],
  ]);
  if (['/limits', '/debug_limits', '/debug_portfolio'].includes(command)) return getBackHomeKeyboard('portfolio');
  if (['/scanner', '/top_gainers', '/top_losers', '/top_volume', '/ai_market', '/ai_market_summary'].includes(command)) return getBackHomeKeyboard('market');
  if (['/ai_portfolio', '/ai_deal', '/ai_trade', '/ai_risk'].includes(command)) return getBackHomeKeyboard('ai');
  if (['/risk_status', '/paper', '/paper_mode', '/emergency_stop', '/risk'].includes(command)) return getBackHomeKeyboard('settings');
  if (['/journal', '/diary', '/daily_report', '/monthly_report', '/commissions', '/export', '/watchlist', '/help'].includes(command)) return getBackHomeKeyboard('settings');

  return getMainKeyboard();
}

export function getNavigationKeyboard(parent: string = 'main'): TelegramBot.SendMessageOptions['reply_markup'] {
  return getBackHomeKeyboard(parent);
}

export function getBackHomeKeyboard(parent: string = 'main'): TelegramBot.SendMessageOptions['reply_markup'] {
  return withBackHome(parent);
}

function withHome(rows: Array<Array<{ text: string; callback_data: string }>>): TelegramBot.SendMessageOptions['reply_markup'] {
  return { inline_keyboard: [...rows, [{ text: '🏠 Главное меню', callback_data: 'menu_home' }]] };
}

function withBackHome(parent: string = 'main', rows: Array<Array<{ text: string; callback_data: string }>> = []): TelegramBot.SendMessageOptions['reply_markup'] {
  return { inline_keyboard: [...rows, [{ text: '⬅️ Назад', callback_data: `menu_back_${parent}` }, { text: '🏠 Главное меню', callback_data: 'menu_home' }]] };
}

export async function handleMenuCallback(query: TelegramBot.CallbackQuery): Promise<void> {
  logger.info(`callback_received: ${query.data ?? 'empty'}`);
  logger.info(`button_clicked: ${query.data ?? 'unknown'}`);
  const data = query.data ?? '';
  const command = callbacks[data];
  if (!command || !commandHandler) {
    logger.warn(`callback_unknown: ${data}`);
    await commandHandler?.(query.message?.chat.id.toString() ?? query.from.id.toString(), '/unknown', query.from.id.toString(), query.message?.message_id);
    return;
  }
  if (data.startsWith('menu_back')) logger.info(`navigation_back: ${data}`);
  if (data === 'menu_home') logger.info('navigation_home');
  logger.info(`callback_handled: ${data} -> ${command}`);
  await commandHandler(query.message?.chat.id.toString() ?? query.from.id.toString(), command, query.from.id.toString(), query.message?.message_id);
}
