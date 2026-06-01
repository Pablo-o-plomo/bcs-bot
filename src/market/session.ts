export type TradingSessionState = 'PREMARKET' | 'OPENING' | 'ACTIVE_SESSION' | 'LOW_ACTIVITY' | 'US_OVERLAP' | 'EVENING' | 'MARKET_CLOSED';

export interface TradingSessionInfo {
  state: TradingSessionState;
  label: string;
  description: string;
}

export function getTradingSession(date = new Date()): TradingSessionInfo {
  const moscowHourRaw = date.getUTCHours() + 3;
  const hour = moscowHourRaw >= 24 ? moscowHourRaw - 24 : moscowHourRaw;
  const minutes = date.getUTCMinutes();
  const day = date.getUTCDay();
  const time = hour + minutes / 60;

  if (day === 0 || day === 6) return { state: 'MARKET_CLOSED', label: '🔒 Рынок закрыт', description: 'выходной день' };
  if (time < 9.5) return { state: 'PREMARKET', label: '🌅 Премаркет', description: 'подготовка к основной сессии' };
  if (time >= 9.5 && time < 11) return { state: 'OPENING', label: '🚀 Открытие рынка', description: 'первые часы с повышенным шумом и импульсами' };
  if (time >= 11 && time < 15) return { state: 'ACTIVE_SESSION', label: '🟢 Активная сессия', description: 'основная ликвидность MOEX' };
  if (time >= 15 && time < 16.5) return { state: 'LOW_ACTIVITY', label: '😴 Низкая активность', description: 'часто ниже импульс и объем' };
  if (time >= 16.5 && time < 19) return { state: 'US_OVERLAP', label: '🇺🇸 Перекрытие с США', description: 'возможна реакция на внешний фон' };
  if (time >= 19 && time < 23.83) return { state: 'EVENING', label: '🌙 Вечерняя сессия', description: 'тоньше стакан и выше риск ложных движений' };
  return { state: 'MARKET_CLOSED', label: '🔒 Рынок закрыт', description: 'основная сессия завершена' };
}
