export interface MarketSessionStatus {
  code: 'main' | 'evening' | 'closed' | 'low_liquidity';
  label: string;
  warning: string;
}

export function getSessionStatus(date = new Date()): MarketSessionStatus {
  const day = date.getUTCDay();
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  // MOEX Moscow time UTC+3 rough windows.
  const moscowMinutes = (minutes + 180) % (24 * 60);
  if (day === 0 || day === 6) return { code: 'closed', label: 'рынок закрыт', warning: 'Выходной день, ликвидность отсутствует.' };
  if (moscowMinutes >= 10 * 60 && moscowMinutes <= 18 * 60 + 45) return { code: 'main', label: 'основная сессия', warning: 'Основная торговая сессия.' };
  if (moscowMinutes > 18 * 60 + 45 && moscowMinutes <= 23 * 60 + 50) return { code: 'evening', label: 'вечерняя сессия', warning: 'Вечерняя сессия: ликвидность может быть ниже.' };
  if (moscowMinutes >= 9 * 60 + 50 && moscowMinutes < 10 * 60) return { code: 'low_liquidity', label: 'премаркет/низкая ликвидность', warning: 'Низколиквидное время перед основной сессией.' };
  return { code: 'closed', label: 'рынок закрыт', warning: 'Рынок закрыт, новые сделки лучше не планировать.' };
}
