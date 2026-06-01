import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger';

export const callbacks: Record<string, string> = {
  portfolio: '/portfolio',
  limits: '/limits',
  market: '/market',
  ai_analysis: '/ai_analysis',
  news: '/news',
  settings_menu: '/settings_menu',
  help: '/help',
};

type CommandHandler = (chatId: string, command: string, fromId?: string) => Promise<void>;
let commandHandler: CommandHandler | undefined;

export function setAdminCommandHandler(handler: CommandHandler): void {
  commandHandler = handler;
}

export function getMainKeyboard(): TelegramBot.SendMessageOptions['reply_markup'] {
  return {
    inline_keyboard: [
      [{ text: '📊 Портфель', callback_data: 'portfolio' }, { text: '💰 Остатки', callback_data: 'limits' }],
      [{ text: '📈 Рынок', callback_data: 'market' }, { text: '🧠 AI Анализ', callback_data: 'ai_analysis' }],
      [{ text: '📰 Новости', callback_data: 'news' }, { text: '⚙️ Настройки', callback_data: 'settings_menu' }],
      [{ text: 'ℹ️ Помощь', callback_data: 'help' }],
    ],
  };
}

export async function handleMenuCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery): Promise<boolean> {
  if (!query.data || !query.message) return false;
  const command = callbacks[query.data];
  if (!command || !commandHandler) return false;
  logger.info(`Telegram button clicked: ${query.data}`);
  await bot.answerCallbackQuery(query.id, { text: 'OK' });
  await commandHandler(query.message.chat.id.toString(), command, query.from.id.toString());
  return true;
}
