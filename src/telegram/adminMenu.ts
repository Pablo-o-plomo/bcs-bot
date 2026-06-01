import TelegramBot from 'node-telegram-bot-api';

export const callbacks: Record<string, string> = {
  portfolio: '/portfolio',
  real_portfolio: '/real_portfolio',
  add_trade: '/add_trade',
  analyze_instrument: '/analyze_instrument',
  ai_review: '/ai_review',
  risk: '/risk',
  commissions: '/commissions',
  diary: '/diary',
  local_diary: '/diary',
  api_status: '/api_status',
  paper_mode: '/paper_mode',
  execution_mode: '/execution_mode',
  risk_status: '/risk_status',
  emergency_stop: '/emergency_stop',
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
      [{ text: '📊 Портфель', callback_data: 'portfolio' }, { text: '📈 Анализ', callback_data: 'analyze_instrument' }],
      [{ text: '📝 Сделка', callback_data: 'add_trade' }, { text: '📒 Локальный дневник', callback_data: 'local_diary' }],
      [{ text: '🤖 Paper mode', callback_data: 'paper_mode' }, { text: '⚡ Execution mode', callback_data: 'execution_mode' }],
      [{ text: '⚠️ Risk status', callback_data: 'risk_status' }, { text: '🚨 Emergency stop', callback_data: 'emergency_stop' }],
      [{ text: '📊 Реальный портфель', callback_data: 'real_portfolio' }, { text: '🧠 AI-разбор сделки', callback_data: 'ai_review' }],
      [{ text: '⚠️ Риск-менеджмент', callback_data: 'risk' }, { text: '💰 Комиссии БКС', callback_data: 'commissions' }],
      [{ text: '📋 Дневник сделок', callback_data: 'diary' }, { text: '📅 Отчет за день', callback_data: 'daily_report' }],
      [{ text: '📆 Отчет за месяц', callback_data: 'monthly_report' }, { text: '🔌 Статус БКС API', callback_data: 'api_status' }],
      [{ text: '⚙️ Настройки', callback_data: 'settings' }],
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
