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

function booleanEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export const config = {
  telegram: {
    botToken: optionalEnv('TELEGRAM_BOT_TOKEN', optionalEnv('BOT_TOKEN', '')),
    adminId: optionalEnv('TELEGRAM_ADMIN_ID', optionalEnv('ADMIN_ID', '')),
    chatId: optionalEnv('TELEGRAM_CHAT_ID', optionalEnv('TELEGRAM_ADMIN_ID', optionalEnv('ADMIN_ID', ''))),
    sendStartupToChannel: booleanEnv('SEND_STARTUP_TO_CHANNEL', false),
  },
  database: {
    url: optionalEnv('DATABASE_URL', './bcs.db'),
  },
  broker: optionalEnv('BROKER', 'BCS'),
  autoTrading: booleanEnv('AUTO_TRADING', false),
  moex: {
    enabled: booleanEnv('MOEX_ENABLED', true),
    baseUrl: optionalEnv('MOEX_ISS_BASE_URL', 'https://iss.moex.com/iss'),
  },
  openai: {
    apiKey: optionalEnv('OPENAI_API_KEY', ''),
  },
  trading: {
    defaultDepositRub: numberEnv('DEFAULT_DEPOSIT_RUB', 300000),
    riskPerTrade: numberEnv('RISK_PER_TRADE', numberEnv('DEFAULT_RISK_PER_TRADE', 1)),
    maxDailyLoss: numberEnv('MAX_DAILY_LOSS', 3),
    maxOpenPositions: numberEnv('MAX_OPEN_POSITIONS', 5),
    minSignalConfidence: numberEnv('MIN_SIGNAL_CONFIDENCE', 6),
  },
  commissions: {
    stockFeePercent: numberEnv('BCS_STOCK_FEE_PERCENT', 0.04),
    currencyFeePercent: numberEnv('BCS_CURRENCY_FEE_PERCENT', 0.04),
    extraCurrencyBuyFeePercent: numberEnv('BCS_EXTRA_CURRENCY_BUY_FEE_PERCENT', 0.1),
    futuresFeePerContract: numberEnv('BCS_FUTURES_FEE_PER_CONTRACT', 1.2),
    optionsMaxPercent: numberEnv('BCS_OPTIONS_MAX_PERCENT', 1),
  },
  server: {
    port: numberEnv('PORT', 3000),
  },
} as const;

export type Config = typeof config;
