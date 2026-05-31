import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { AiReview, AnalysisReport, BcsTradeInput, BotState, BrokerFee, Instrument, PortfolioSnapshot, Signal, Trade, UserSettings } from './models';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function initDb(): void {
  const dbPath = path.resolve(config.database.url);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  seedDefaults();
  logger.info(`📦 SQLite database initialized: ${dbPath}`);
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL UNIQUE,
      username TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      telegram_id TEXT NOT NULL UNIQUE,
      deposit_rub REAL NOT NULL DEFAULT ${config.trading.defaultDepositRub},
      risk_per_trade_percent REAL NOT NULL DEFAULT ${config.trading.riskPerTrade},
      broker TEXT NOT NULL DEFAULT 'BCS',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      name TEXT,
      type TEXT NOT NULL,
      lot_size REAL NOT NULL DEFAULT 1,
      price_step REAL,
      currency TEXT NOT NULL DEFAULT 'RUB'
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER,
      telegram_id TEXT,
      symbol TEXT NOT NULL,
      instrument_type TEXT NOT NULL DEFAULT 'stock',
      direction TEXT NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL,
      stop_loss REAL NOT NULL,
      take_profit REAL NOT NULL,
      take_profit1 REAL NOT NULL,
      take_profit2 REAL,
      take_profit3 REAL,
      quantity REAL NOT NULL,
      position_size REAL NOT NULL,
      leverage REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'open',
      result TEXT,
      pnl_percent REAL,
      pnl_rub REAL,
      pnl_usdt REAL,
      commission_rub REAL NOT NULL DEFAULT 0,
      risk_rub REAL NOT NULL DEFAULT 0,
      risk_percent REAL NOT NULL DEFAULT 0,
      risk_reward REAL NOT NULL DEFAULT 0,
      entry_reasons TEXT NOT NULL DEFAULT '[]',
      exit_reason TEXT,
      exit_analysis TEXT,
      improvements TEXT,
      error_tags TEXT,
      indicators_at_entry TEXT,
      comment TEXT,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL,
      telegram_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      quantity REAL NOT NULL,
      avg_price REAL NOT NULL,
      current_price REAL,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trade_id) REFERENCES trades(id)
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      deposit_rub REAL NOT NULL,
      open_positions INTEGER NOT NULL,
      total_pnl_rub REAL NOT NULL,
      fees_rub REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS broker_fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      editable INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ai_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER,
      telegram_id TEXT NOT NULL,
      request_text TEXT NOT NULL,
      review_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trade_id) REFERENCES trades(id)
    );

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_price REAL NOT NULL,
      stop_loss REAL NOT NULL,
      take_profit1 REAL NOT NULL,
      take_profit2 REAL NOT NULL,
      take_profit3 REAL NOT NULL,
      risk_percent REAL NOT NULL,
      position_size REAL NOT NULL,
      leverage REAL NOT NULL DEFAULT 1,
      risk_reward REAL NOT NULL,
      confidence INTEGER NOT NULL,
      reasons TEXT NOT NULL,
      warnings TEXT DEFAULT '[]',
      timeframe_confirmations TEXT DEFAULT '[]',
      indicator_summary TEXT,
      cancel_conditions TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      indicators TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analysis_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      total_trades INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      avg_profit REAL NOT NULL,
      avg_loss REAL NOT NULL,
      profit_factor REAL NOT NULL,
      best_setups TEXT NOT NULL,
      worst_setups TEXT NOT NULL,
      frequent_errors TEXT NOT NULL,
      recommendations TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      is_paused INTEGER NOT NULL DEFAULT 0,
      paused_until TEXT,
      pause_reason TEXT,
      consecutive_losses INTEGER NOT NULL DEFAULT 0,
      daily_loss_percent REAL NOT NULL DEFAULT 0,
      last_daily_reset TEXT NOT NULL DEFAULT CURRENT_DATE,
      total_balance REAL NOT NULL DEFAULT ${config.trading.defaultDepositRub},
      mode TEXT NOT NULL DEFAULT 'analytics',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reject_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT,
      reason TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO bot_state (id) VALUES (1);
  `);
}

function seedDefaults(): void {
  const instruments: Instrument[] = [
    { ticker: 'SBER', name: 'Сбербанк', type: 'stock', lotSize: 10, currency: 'RUB' },
    { ticker: 'GAZP', name: 'Газпром', type: 'stock', lotSize: 10, currency: 'RUB' },
    { ticker: 'LKOH', name: 'Лукойл', type: 'stock', lotSize: 1, currency: 'RUB' },
    { ticker: 'IMOEX', name: 'Индекс МосБиржи', type: 'fund', lotSize: 1, currency: 'RUB' },
    { ticker: 'Si', name: 'USD/RUB futures', type: 'future', lotSize: 1, currency: 'RUB' },
    { ticker: 'BR', name: 'Brent futures', type: 'future', lotSize: 1, currency: 'RUB' },
    { ticker: 'GOLD', name: 'Gold futures/fund', type: 'future', lotSize: 1, currency: 'RUB' },
  ];
  const insertInstrument = db.prepare('INSERT OR IGNORE INTO instruments (ticker, name, type, lot_size, currency) VALUES (?, ?, ?, ?, ?)');
  for (const item of instruments) insertInstrument.run(item.ticker, item.name, item.type, item.lotSize, item.currency);

  const fees: BrokerFee[] = [
    { name: 'monthly_service_rub', value: config.commissions.monthlyServiceRub, unit: 'rub', editable: true },
    { name: 'securities_rate_percent', value: config.commissions.securitiesRatePercent, unit: 'percent', editable: true },
    { name: 'currency_rate_percent', value: config.commissions.currencyRatePercent, unit: 'percent', editable: true },
    { name: 'currency_purchase_extra_percent', value: config.commissions.currencyPurchaseExtraPercent, unit: 'percent', editable: true },
    { name: 'futures_fee_rub_per_contract', value: config.commissions.futuresFeeRubPerContract, unit: 'rub_per_contract', editable: true },
    { name: 'options_max_percent', value: config.commissions.optionsMaxPercent, unit: 'percent', editable: true },
  ];
  const insertFee = db.prepare('INSERT OR REPLACE INTO broker_fees (name, value, unit, editable) VALUES (?, ?, ?, ?)');
  for (const fee of fees) insertFee.run(fee.name, fee.value, fee.unit, fee.editable ? 1 : 0);
}

export function ensureUser(telegramId: string, username?: string): void {
  const info = db.prepare('INSERT OR IGNORE INTO users (telegram_id, username) VALUES (?, ?)').run(telegramId, username ?? null);
  const user = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(telegramId) as { id: number };
  db.prepare('INSERT OR IGNORE INTO settings (user_id, telegram_id, deposit_rub, risk_per_trade_percent, broker) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, telegramId, config.trading.defaultDepositRub, config.trading.riskPerTrade, config.broker);
  if (info.changes > 0) logger.info(`👤 User registered: ${telegramId}`);
}

export function getUserSettings(telegramId: string): UserSettings {
  ensureUser(telegramId);
  const row = db.prepare('SELECT * FROM settings WHERE telegram_id = ?').get(telegramId) as any;
  return {
    id: row.id,
    userId: row.user_id,
    telegramId: row.telegram_id,
    depositRub: row.deposit_rub,
    riskPerTradePercent: row.risk_per_trade_percent,
    broker: row.broker,
  };
}

export function updateUserSettings(telegramId: string, patch: Partial<Pick<UserSettings, 'depositRub' | 'riskPerTradePercent'>>): void {
  const current = getUserSettings(telegramId);
  db.prepare('UPDATE settings SET deposit_rub = ?, risk_per_trade_percent = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?')
    .run(patch.depositRub ?? current.depositRub, patch.riskPerTradePercent ?? current.riskPerTradePercent, telegramId);
}

export function getInstruments(): Instrument[] {
  return (db.prepare('SELECT * FROM instruments ORDER BY type, ticker').all() as any[]).map(row => ({
    id: row.id,
    ticker: row.ticker,
    name: row.name ?? undefined,
    type: row.type,
    lotSize: row.lot_size,
    priceStep: row.price_step ?? undefined,
    currency: row.currency,
  }));
}

export function getInstrument(ticker: string): Instrument | null {
  const row = db.prepare('SELECT * FROM instruments WHERE UPPER(ticker) = UPPER(?)').get(ticker) as any;
  return row ? { id: row.id, ticker: row.ticker, name: row.name ?? undefined, type: row.type, lotSize: row.lot_size, priceStep: row.price_step ?? undefined, currency: row.currency } : null;
}

export function saveBcsTrade(input: BcsTradeInput, risk: { positionAmountRub: number; riskRub: number; riskPercentOfDeposit: number; potentialProfitRub: number; riskReward: number; commissionRub: number }): number {
  const result = db.prepare(`
    INSERT INTO trades (telegram_id, symbol, instrument_type, direction, entry_price, stop_loss, take_profit, take_profit1, quantity,
      position_size, leverage, status, commission_rub, risk_rub, risk_percent, risk_reward, entry_reasons, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'open', ?, ?, ?, ?, ?, ?)
  `).run(
    input.telegramId,
    input.symbol,
    input.instrumentType,
    input.direction,
    input.entryPrice,
    input.stopLoss,
    input.takeProfit,
    input.takeProfit,
    input.quantity,
    risk.positionAmountRub,
    risk.commissionRub,
    risk.riskRub,
    risk.riskPercentOfDeposit,
    risk.riskReward,
    JSON.stringify(['Пользовательская сделка БКС']),
    input.comment ?? null,
  );
  const id = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO positions (trade_id, telegram_id, symbol, quantity, avg_price) VALUES (?, ?, ?, ?, ?)')
    .run(id, input.telegramId, input.symbol, input.quantity, input.entryPrice);
  return id;
}

export function saveAiReview(review: AiReview): void {
  db.prepare('INSERT INTO ai_reviews (trade_id, telegram_id, request_text, review_text) VALUES (?, ?, ?, ?)')
    .run(review.tradeId ?? null, review.telegramId, review.requestText, review.reviewText);
}

export function getOpenTrades(telegramId?: string): Trade[] {
  const rows = telegramId
    ? db.prepare("SELECT * FROM trades WHERE telegram_id = ? AND status = 'open' ORDER BY opened_at DESC").all(telegramId) as any[]
    : db.prepare("SELECT * FROM trades WHERE status = 'open' ORDER BY opened_at DESC").all() as any[];
  return rows.map(rowToTrade);
}

export function getTradeById(id: number): Trade | null {
  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as any;
  return row ? rowToTrade(row) : null;
}

export function getLastNTrades(n: number, telegramId?: string): Trade[] {
  const rows = telegramId
    ? db.prepare("SELECT * FROM trades WHERE telegram_id = ? AND status != 'open' ORDER BY COALESCE(closed_at, opened_at) DESC LIMIT ?").all(telegramId, n) as any[]
    : db.prepare("SELECT * FROM trades WHERE status != 'open' ORDER BY COALESCE(closed_at, opened_at) DESC LIMIT ?").all(n) as any[];
  return rows.map(rowToTrade);
}

export function getTodayTrades(telegramId?: string): Trade[] {
  const rows = telegramId
    ? db.prepare("SELECT * FROM trades WHERE telegram_id = ? AND DATE(opened_at) = DATE('now') ORDER BY opened_at DESC").all(telegramId) as any[]
    : db.prepare("SELECT * FROM trades WHERE DATE(opened_at) = DATE('now') ORDER BY opened_at DESC").all() as any[];
  return rows.map(rowToTrade);
}

export function getMonthTrades(telegramId?: string): Trade[] {
  const rows = telegramId
    ? db.prepare("SELECT * FROM trades WHERE telegram_id = ? AND strftime('%Y-%m', opened_at) = strftime('%Y-%m', 'now') ORDER BY opened_at DESC").all(telegramId) as any[]
    : db.prepare("SELECT * FROM trades WHERE strftime('%Y-%m', opened_at) = strftime('%Y-%m', 'now') ORDER BY opened_at DESC").all() as any[];
  return rows.map(rowToTrade);
}

function rowToTrade(row: any): Trade {
  return {
    id: row.id,
    signalId: row.signal_id ?? undefined,
    telegramId: row.telegram_id ?? undefined,
    symbol: row.symbol,
    instrumentType: row.instrument_type,
    direction: row.direction,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price ?? undefined,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    takeProfit1: row.take_profit1,
    takeProfit2: row.take_profit2 ?? undefined,
    takeProfit3: row.take_profit3 ?? undefined,
    quantity: row.quantity,
    positionSize: row.position_size,
    leverage: row.leverage,
    status: row.status,
    result: row.result ?? undefined,
    pnlPercent: row.pnl_percent ?? undefined,
    pnlRub: row.pnl_rub ?? undefined,
    pnlUsdt: row.pnl_usdt ?? undefined,
    finalPnl: row.pnl_percent ?? undefined,
    currentPnl: row.pnl_percent ?? undefined,
    commissionRub: row.commission_rub,
    riskRub: row.risk_rub,
    riskPercent: row.risk_percent,
    riskReward: row.risk_reward,
    entryReasons: row.entry_reasons ? JSON.parse(row.entry_reasons) : [],
    exitReason: row.exit_reason ?? undefined,
    exitAnalysis: row.exit_analysis ?? undefined,
    improvements: row.improvements ? JSON.parse(row.improvements) : undefined,
    errorTags: row.error_tags ? JSON.parse(row.error_tags) : undefined,
    indicatorsAtEntry: row.indicators_at_entry ? JSON.parse(row.indicators_at_entry) : undefined,
    comment: row.comment ?? undefined,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
  };
}

export function savePortfolioSnapshot(snapshot: PortfolioSnapshot): void {
  db.prepare('INSERT INTO portfolio_snapshots (telegram_id, deposit_rub, open_positions, total_pnl_rub, fees_rub) VALUES (?, ?, ?, ?, ?)')
    .run(snapshot.telegramId, snapshot.depositRub, snapshot.openPositions, snapshot.totalPnlRub, snapshot.feesRub);
}

export function saveSignal(signal: Signal): number {
  const result = db.prepare(`INSERT INTO signals (symbol, direction, entry_price, stop_loss, take_profit1, take_profit2, take_profit3, risk_percent, position_size, leverage, risk_reward, confidence, reasons, warnings, timeframe_confirmations, indicator_summary, cancel_conditions, timeframe, status, indicators) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(signal.symbol, signal.direction, signal.entryPrice, signal.stopLoss, signal.takeProfit1, signal.takeProfit2, signal.takeProfit3, signal.riskPercent, signal.positionSize, signal.leverage, signal.riskReward, signal.confidence, JSON.stringify(signal.reasons), JSON.stringify(signal.warnings), JSON.stringify(signal.timeframeConfirmations), JSON.stringify(signal.indicatorSummary), JSON.stringify(signal.cancelConditions), signal.timeframe, signal.status, JSON.stringify(signal.indicators ?? null));
  return Number(result.lastInsertRowid);
}

export function saveTrade(trade: Trade): number {
  return saveBcsTrade({ telegramId: trade.telegramId ?? 'system', symbol: trade.symbol, instrumentType: trade.instrumentType ?? 'stock', direction: trade.direction, entryPrice: trade.entryPrice, quantity: trade.quantity ?? trade.positionSize, stopLoss: trade.stopLoss, takeProfit: trade.takeProfit ?? trade.takeProfit1, commissionRub: trade.commissionRub, comment: trade.comment }, { positionAmountRub: trade.positionSize * trade.entryPrice, riskRub: trade.riskRub ?? 0, riskPercentOfDeposit: trade.riskPercent ?? 0, potentialProfitRub: 0, riskReward: trade.riskReward ?? 0, commissionRub: trade.commissionRub ?? 0 });
}

export function closeTrade(id: number, exitPrice: number, status: string, result: string, pnlPercent: number, pnlRub: number, exitReason: string, exitAnalysis: string, improvements: string[], errorTags: string[]): void {
  db.prepare(`UPDATE trades SET exit_price = ?, status = ?, result = ?, pnl_percent = ?, pnl_rub = ?, exit_reason = ?, exit_analysis = ?, improvements = ?, error_tags = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(exitPrice, status, result, pnlPercent, pnlRub, exitReason, exitAnalysis, JSON.stringify(improvements), JSON.stringify(errorTags), id);
}

export function getRecentSignals(limit = 5): Signal[] {
  const rows = db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(row => ({
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    entryPrice: row.entry_price,
    stopLoss: row.stop_loss,
    takeProfit1: row.take_profit1,
    takeProfit2: row.take_profit2,
    takeProfit3: row.take_profit3,
    riskPercent: row.risk_percent,
    positionSize: row.position_size,
    leverage: row.leverage,
    riskReward: row.risk_reward,
    confidence: row.confidence,
    reasons: JSON.parse(row.reasons),
    warnings: row.warnings ? JSON.parse(row.warnings) : [],
    timeframeConfirmations: row.timeframe_confirmations ? JSON.parse(row.timeframe_confirmations) : [],
    indicatorSummary: row.indicator_summary ? JSON.parse(row.indicator_summary) : undefined,
    cancelConditions: JSON.parse(row.cancel_conditions),
    timeframe: row.timeframe,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export function saveAnalysisReport(report: AnalysisReport): void {
  db.prepare(`INSERT INTO analysis_reports (period_start, period_end, total_trades, wins, losses, win_rate, avg_profit, avg_loss, profit_factor, best_setups, worst_setups, frequent_errors, recommendations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(report.periodStart, report.periodEnd, report.totalTrades, report.wins, report.losses, report.winRate, report.avgProfit, report.avgLoss, report.profitFactor, JSON.stringify(report.bestSetups), JSON.stringify(report.worstSetups), JSON.stringify(report.frequentErrors), JSON.stringify(report.recommendations));
}

export function getBotState(): BotState {
  const row = db.prepare('SELECT * FROM bot_state WHERE id = 1').get() as any;
  return {
    isPaused: row.is_paused === 1,
    pausedUntil: row.paused_until ?? undefined,
    pauseReason: row.pause_reason ?? undefined,
    consecutiveLosses: row.consecutive_losses,
    dailyLossPercent: row.daily_loss_percent,
    lastDailyReset: row.last_daily_reset,
    totalBalance: row.total_balance,
    mode: 'analytics',
  };
}

export function updateBotState(partial: Partial<BotState>): void {
  const current = getBotState();
  const merged = { ...current, ...partial };
  db.prepare('UPDATE bot_state SET is_paused = ?, paused_until = ?, pause_reason = ?, consecutive_losses = ?, daily_loss_percent = ?, last_daily_reset = ?, total_balance = ?, mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
    .run(merged.isPaused ? 1 : 0, merged.pausedUntil ?? null, merged.pauseReason ?? null, merged.consecutiveLosses, merged.dailyLossPercent, merged.lastDailyReset, merged.totalBalance, 'analytics');
}

export function recordReject(symbol: string, timeframe: string | undefined, reason: string, details?: string): void {
  db.prepare('INSERT INTO reject_events (symbol, timeframe, reason, details) VALUES (?, ?, ?, ?)').run(symbol, timeframe ?? null, reason, details ?? null);
}

export function getRejectStats(limit = 100): Array<{ reason: string; count: number }> {
  return db.prepare('SELECT reason, COUNT(*) as count FROM reject_events GROUP BY reason ORDER BY count DESC LIMIT ?').all(limit) as Array<{ reason: string; count: number }>;
}

export function getRejectStatsBySymbol(limit = 10): Array<{ symbol: string; count: number }> {
  return db.prepare('SELECT symbol, COUNT(*) as count FROM reject_events GROUP BY symbol ORDER BY count DESC LIMIT ?').all(limit) as Array<{ symbol: string; count: number }>;
}

export function getRejectStatsByTimeframe(limit = 10): Array<{ timeframe: string; count: number }> {
  return db.prepare("SELECT COALESCE(timeframe, 'n/a') as timeframe, COUNT(*) as count FROM reject_events GROUP BY COALESCE(timeframe, 'n/a') ORDER BY count DESC LIMIT ?").all(limit) as Array<{ timeframe: string; count: number }>;
}

export function getRejectCountSince(hours: number): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM reject_events WHERE created_at >= datetime('now', ?)").get(`-${hours} hours`) as { count: number };
  return row.count;
}

export function getWinrateBySymbol(telegramId?: string): Array<{ symbol: string; winrate: number; trades: number; pnlPercent: number; pnlRub: number }> {
  const rows = telegramId
    ? db.prepare(`SELECT symbol, COUNT(*) AS trades, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins, AVG(COALESCE(pnl_percent, 0)) AS avg_pnl, SUM(COALESCE(pnl_rub, 0)) AS sum_pnl FROM trades WHERE telegram_id = ? AND status != 'open' GROUP BY symbol ORDER BY wins DESC`).all(telegramId) as any[]
    : db.prepare(`SELECT symbol, COUNT(*) AS trades, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins, AVG(COALESCE(pnl_percent, 0)) AS avg_pnl, SUM(COALESCE(pnl_rub, 0)) AS sum_pnl FROM trades WHERE status != 'open' GROUP BY symbol ORDER BY wins DESC`).all() as any[];
  return rows.map(row => ({ symbol: row.symbol, trades: row.trades, winrate: row.trades > 0 ? (row.wins / row.trades) * 100 : 0, pnlPercent: row.avg_pnl ?? 0, pnlRub: row.sum_pnl ?? 0 }));
}

export function updateTradeLifecycle(): void {
  // Not used in BCS analytics-only mode.
}
