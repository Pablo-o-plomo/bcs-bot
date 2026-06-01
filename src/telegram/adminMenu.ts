import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger';

export const callbacks: Record<string, string> = {
  portfolio: '/portfolio',
  real_portfolio: '/portfolio',
  limits: '/limits',
  risk_menu: '/risk_menu',
  risk: '/risk_menu',
  ai_analysis: '/ai_analysis',
  market: '/market',
  news: '/news',
  help: '/help',
  diary_menu: '/diary_menu',
  diary: '/diary_menu',
  daily_report_menu: '/daily_report_menu',
  daily_report: '/daily_report_menu',
  settings_menu: '/settings_menu',
  settings: '/settings_menu',
  api_status: '/api_status',
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
      [{ text: '📊 Портфель', callback_data: 'portfolio' }, { text: '💰 Остатки', callback_data: 'limits' }],
      [{ text: '🛡️ Риск', callback_data: 'risk_menu' }, { text: '🧠 AI Анализ', callback_data: 'ai_analysis' }],
      [{ text: '📋 Дневник сделок', callback_data: 'diary_menu' }, { text: '📅 Дневной отчет', callback_data: 'daily_report_menu' }],
      [{ text: '⚙️ Настройки', callback_data: 'settings_menu' }, { text: '🔌 Статус BCS API', callback_data: 'api_status' }],
    ],
  };
}

export function getNavigationKeyboard(): TelegramBot.SendMessageOptions['reply_markup'] {
  return {
    inline_keyboard: [
      [{ text: '⬅️ Назад', callback_data: 'menu_back' }, { text: '🏠 Главное меню', callback_data: 'menu_home' }],
    ],
  };
}

export async function handleMenuCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery): Promise<boolean> {
  if (!query.data || !query.message) return false;
  const command = callbacks[query.data];
  if (!command || !commandHandler) return false;
  logger.info(`button_clicked: ${query.data}`);
  logger.info(`menu_navigation: ${query.data} -> ${command}`);
  await bot.answerCallbackQuery(query.id, { text: 'OK' });
  await commandHandler(query.message.chat.id.toString(), command, query.from.id.toString(), query.message.message_id);
  return true;
}
