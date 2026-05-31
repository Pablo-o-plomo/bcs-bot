import TelegramBot from 'node-telegram-bot-api';

export const callbacks: Record<string, string> = {
  portfolio: '/portfolio',
  add_trade: '/add_trade',
  analyze_instrument: '/analyze_instrument',
  ai_review: '/ai_review',
  risk: '/risk',
  commissions: '/commissions',
  diary: '/diary',
  daily_report: '/daily_report',
  monthly_report: '/monthly_report',
  settings: '/settings',
};

type CommandHandler = (chatId: string, command: string, fromId?: string) => Promise<void>;
let commandHandler: CommandHandler | undefined;

export function setAdminCommandHandler(handler: CommandHandler): void {
  commandHandler = handler;
}

export function getMainKeyboard(): TelegramBot.SendMessageOptions['reply_markup'] {
  return {
    inline_keyboard: [
      [{ text: '📊 Портфель', callback_data: 'portfolio' }, { text: '📝 Добавить сделку', callback_data: 'add_trade' }],
      [{ text: '📈 Анализ инструмента', callback_data: 'analyze_instrument' }, { text: '🧠 AI-разбор сделки', callback_data: 'ai_review' }],
      [{ text: '⚠️ Риск-менеджмент', callback_data: 'risk' }, { text: '💰 Комиссии БКС', callback_data: 'commissions' }],
      [{ text: '📋 Дневник сделок', callback_data: 'diary' }, { text: '📅 Отчет за день', callback_data: 'daily_report' }],
      [{ text: '📆 Отчет за месяц', callback_data: 'monthly_report' }, { text: '⚙️ Настройки', callback_data: 'settings' }],
    ],
  };
}

export async function handleMenuCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery): Promise<boolean> {
  if (!query.data || !query.message) return false;
  const command = callbacks[query.data];
  if (!command || !commandHandler) return false;
  await bot.answerCallbackQuery(query.id, { text: 'OK' });
  await commandHandler(query.message.chat.id.toString(), command, query.from.id.toString());
  return true;
}
