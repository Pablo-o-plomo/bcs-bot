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
  allowOrderExecution: booleanEnv('ALLOW_ORDER_EXECUTION', false),
  readOnlyMode: booleanEnv('READ_ONLY_MODE', true),
  execution: {
    mode: optionalEnv('EXECUTION_MODE', 'manual_confirm') as 'manual_confirm' | 'paper' | 'semi_auto' | 'disabled',
    maxPositionPercent: numberEnv('MAX_POSITION_PERCENT', 5),
    maxDailyLossPercent: numberEnv('MAX_DAILY_LOSS_PERCENT', numberEnv('MAX_DAILY_LOSS', 3)),
    maxOpenPositions: numberEnv('MAX_OPEN_POSITIONS', 3),
    allowedSymbols: optionalEnv('ALLOWED_SYMBOLS', 'Si,BR,GOLD,IMOEX,SBER,GAZP,LKOH').split(',').map(s => s.trim()).filter(Boolean),
    allowShorts: booleanEnv('ALLOW_SHORTS', true),
    emergencyStopEnabled: booleanEnv('EMERGENCY_STOP_ENABLED', true),
  },
  bcsApi: {
    enabled: booleanEnv('BCS_API_ENABLED', false),
    token: optionalEnv('BCS_API_TOKEN', ''),
    accountId: optionalEnv('BCS_ACCOUNT_ID', ''),
    clientId: optionalEnv('BCS_CLIENT_ID', 'trade-api-read'),
    baseUrl: optionalEnv('BCS_API_BASE_URL', 'https://be.broker.ru'),
    authUrl: optionalEnv('BCS_AUTH_URL', ''),
    timeoutMs: numberEnv('BCS_API_TIMEOUT_MS', 10000),
    maxRetries: numberEnv('BCS_API_MAX_RETRIES', 2),
  },
  moex: {
    enabled: booleanEnv('MOEX_ENABLED', true),
    baseUrl: optionalEnv('MOEX_ISS_BASE_URL', 'https://iss.moex.com/iss'),
  },
  openai: {
    apiKey: optionalEnv('OPENAI_API_KEY', ''),
  },
  trading: {
    defaultDepositRub: numberEnv('DEFAULT_DEPOSIT_RUB', 0),
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
