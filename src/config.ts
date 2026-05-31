import dotenv from 'dotenv';
dotenv.config();

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function numberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const botToken = optionalEnv('BOT_TOKEN', optionalEnv('TELEGRAM_BOT_TOKEN', ''));
const adminId = optionalEnv('ADMIN_ID', optionalEnv('TELEGRAM_ADMIN_ID', ''));

export const config = {
  telegram: {
    botToken,
    adminId,
    chatId: optionalEnv('TELEGRAM_CHAT_ID', adminId),
    sendStartupToChannel: optionalEnv('SEND_STARTUP_TO_CHANNEL', 'false') === 'true',
  },
  openai: {
    apiKey: optionalEnv('OPENAI_API_KEY', ''),
  },
  broker: optionalEnv('BROKER', 'BCS'),
  database: {
    url: optionalEnv('DATABASE_URL', './bcs-trading.db'),
  },
  trading: {
    defaultDepositRub: numberEnv('DEFAULT_DEPOSIT_RUB', 100000),
    riskPerTrade: numberEnv('DEFAULT_RISK_PER_TRADE', 1),
    maxDailyLoss: numberEnv('MAX_DAILY_LOSS', 3),
    maxOpenPositions: numberEnv('MAX_OPEN_POSITIONS', 10),
    autoOptimize: optionalEnv('AUTO_OPTIMIZE', 'false') === 'true',
    instruments: optionalEnv('INSTRUMENTS', 'SBER,GAZP,LKOH,IMOEX,Si,BR,GOLD')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },
  commissions: {
    monthlyServiceRub: numberEnv('BCS_MONTHLY_SERVICE_RUB', 299),
    securitiesRatePercent: numberEnv('BCS_SECURITIES_RATE_PERCENT', 0.04),
    currencyRatePercent: numberEnv('BCS_CURRENCY_RATE_PERCENT', 0.04),
    currencyPurchaseExtraPercent: numberEnv('BCS_CURRENCY_PURCHASE_EXTRA_PERCENT', 0.1),
    futuresFeeRubPerContract: numberEnv('BCS_FUTURES_FEE_RUB_PER_CONTRACT', 1.2),
    optionsMaxPercent: numberEnv('BCS_OPTIONS_MAX_PERCENT', 1),
  },
  server: {
    port: numberEnv('PORT', 3000),
  },
} as const;

export type Config = typeof config;
