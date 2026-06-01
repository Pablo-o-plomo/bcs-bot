import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { AiReview, AnalysisReport, BrokerFee, Direction, Instrument, InstrumentType, Trade, TradeInput, User, UserSettings } from './models';

let db: any;

export function getDb(): any {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function initDb(): void {
  const dbPath = path.resolve(config.database.url);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  createTables();
  seedInstruments();
  logger.info(`📦 SQLite database initialized: ${dbPath}`);
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegramId TEXT NOT NULL UNIQUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE,
      depositRub REAL NOT NULL DEFAULT ${config.trading.defaultDepositRub},
      riskPerTrade REAL NOT NULL DEFAULT ${config.trading.riskPerTrade},
      maxDailyLoss REAL NOT NULL DEFAULT ${config.trading.maxDailyLoss},
      maxOpenPositions INTEGER NOT NULL DEFAULT ${config.trading.maxOpenPositions},
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      market TEXT NOT NULL DEFAULT 'MOEX'
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      instrumentType TEXT NOT NULL,
      direction TEXT NOT NULL,
      entryPrice REAL NOT NULL,
      exitPrice REAL,
      quantity REAL NOT NULL,
      stopLoss REAL NOT NULL,
      takeProfit REAL NOT NULL,
      commission REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      pnl REAL NOT NULL DEFAULT 0,
      rr REAL NOT NULL DEFAULT 0,
      comment TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      closedAt DATETIME,
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      direction TEXT NOT NULL,
      avgEntryPrice REAL NOT NULL,
      quantity REAL NOT NULL,
      stopLoss REAL NOT NULL,
      takeProfit REAL NOT NULL,
      currentPrice REAL,
      unrealizedPnl REAL NOT NULL DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS broker_fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE,
      tariffName TEXT NOT NULL DEFAULT 'БКС базовый',
      stockFeePercent REAL NOT NULL DEFAULT ${config.commissions.stockFeePercent},
      currencyFeePercent REAL NOT NULL DEFAULT ${config.commissions.currencyFeePercent},
      futuresFeePerContract REAL NOT NULL DEFAULT ${config.commissions.futuresFeePerContract},
      extraCurrencyBuyFeePercent REAL NOT NULL DEFAULT ${config.commissions.extraCurrencyBuyFeePercent},
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ai_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tradeId INTEGER,
      reviewText TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tradeId) REFERENCES trades(id)
    );



    CREATE TABLE IF NOT EXISTS bcs_portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'BCS API',
      balance REAL NOT NULL DEFAULT 0,
      freeCash REAL NOT NULL DEFAULT 0,
      portfolioValue REAL NOT NULL DEFAULT 0,
      dayPnl REAL NOT NULL DEFAULT 0,
      totalPnl REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RUB',
      syncedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bcs_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      name TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      averagePrice REAL NOT NULL DEFAULT 0,
      currentPrice REAL NOT NULL DEFAULT 0,
      unrealizedPnl REAL NOT NULL DEFAULT 0,
      portfolioSharePercent REAL NOT NULL DEFAULT 0,
      instrumentType TEXT,
      classCode TEXT,
      syncedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bcs_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      externalId TEXT NOT NULL UNIQUE,
      ticker TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      commission REAL NOT NULL DEFAULT 0,
      tradeDateTime TEXT NOT NULL,
      instrumentType TEXT,
      classCode TEXT,
      syncedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analysis_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodStart TEXT NOT NULL,
      periodEnd TEXT NOT NULL,
      totalTrades INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      winRate REAL NOT NULL,
      avgProfit REAL NOT NULL,
      avgLoss REAL NOT NULL,
      profitFactor REAL NOT NULL,
      bestSetups TEXT NOT NULL,
      worstSetups TEXT NOT NULL,
      frequentErrors TEXT NOT NULL,
      recommendations TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedInstruments(): void {
  const items: Array<Omit<Instrument, 'id'>> = [
    { ticker: 'SBER', name: 'Сбербанк', type: 'stock', market: 'MOEX' },
    { ticker: 'GAZP', name: 'Газпром', type: 'stock', market: 'MOEX' },
    { ticker: 'LKOH', name: 'Лукойл', type: 'stock', market: 'MOEX' },
    { ticker: 'IMOEX', name: 'Индекс МосБиржи', type: 'fund', market: 'MOEX' },
    { ticker: 'Si', name: 'Фьючерс USD/RUB', type: 'future', market: 'MOEX' },
    { ticker: 'BR', name: 'Фьючерс Brent', type: 'future', market: 'MOEX' },
    { ticker: 'GOLD', name: 'Золото', type: 'future', market: 'MOEX' },
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO instruments (ticker, name, type, market) VALUES (?, ?, ?, ?)');
  for (const item of items) stmt.run(item.ticker, item.name, item.type, item.market);
}

export function ensureUser(telegramId: string): User {
  db.prepare('INSERT OR IGNORE INTO users (telegramId) VALUES (?)').run(telegramId);
  const user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId) as User;
  db.prepare('INSERT OR IGNORE INTO settings (userId, depositRub, riskPerTrade, maxDailyLoss, maxOpenPositions) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, config.trading.defaultDepositRub, config.trading.riskPerTrade, config.trading.maxDailyLoss, config.trading.maxOpenPositions);
  db.prepare('INSERT OR IGNORE INTO broker_fees (userId, tariffName, stockFeePercent, currencyFeePercent, futuresFeePerContract, extraCurrencyBuyFeePercent) VALUES (?, ?, ?, ?, ?, ?)')
    .run(user.id, 'БКС базовый', config.commissions.stockFeePercent, config.commissions.currencyFeePercent, config.commissions.futuresFeePerContract, config.commissions.extraCurrencyBuyFeePercent);
  return user;
}

export function getUserSettingsByUserId(userId: number): UserSettings {
  return db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as UserSettings;
}

export function getUserSettings(telegramId: string): UserSettings & { telegramId: string; broker: string; riskPerTradePercent: number } {
  const user = ensureUser(telegramId);
  const settings = getUserSettingsByUserId(user.id);
  return { ...settings, telegramId, broker: config.broker, riskPerTradePercent: settings.riskPerTrade };
}

export function updateUserSettings(telegramId: string, patch: Partial<UserSettings & { riskPerTradePercent: number }>): void {
  const user = ensureUser(telegramId);
  const current = getUserSettingsByUserId(user.id);
  db.prepare('UPDATE settings SET depositRub = ?, riskPerTrade = ?, maxDailyLoss = ?, maxOpenPositions = ? WHERE userId = ?')
    .run(
      patch.depositRub ?? current.depositRub,
      patch.riskPerTrade ?? patch.riskPerTradePercent ?? current.riskPerTrade,
      patch.maxDailyLoss ?? current.maxDailyLoss,
      patch.maxOpenPositions ?? current.maxOpenPositions,
      user.id,
    );
}

export function getBrokerFee(userId: number): BrokerFee {
  return db.prepare('SELECT * FROM broker_fees WHERE userId = ?').get(userId) as BrokerFee;
}

export function updateBrokerFee(userId: number, patch: Partial<BrokerFee>): void {
  const current = getBrokerFee(userId);
  db.prepare('UPDATE broker_fees SET tariffName = ?, stockFeePercent = ?, currencyFeePercent = ?, futuresFeePerContract = ?, extraCurrencyBuyFeePercent = ? WHERE userId = ?')
    .run(
      patch.tariffName ?? current.tariffName,
      patch.stockFeePercent ?? current.stockFeePercent,
      patch.currencyFeePercent ?? current.currencyFeePercent,
      patch.futuresFeePerContract ?? current.futuresFeePerContract,
      patch.extraCurrencyBuyFeePercent ?? current.extraCurrencyBuyFeePercent,
      userId,
    );
}

export function getInstruments(): Instrument[] {
  return db.prepare('SELECT * FROM instruments ORDER BY type, ticker').all() as Instrument[];
}

export function saveTrade(input: TradeInput): number {
  const result = db.prepare(`
    INSERT INTO trades (userId, ticker, instrumentType, direction, entryPrice, quantity, stopLoss, takeProfit, commission, status, pnl, rr, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(input.userId, input.ticker, input.instrumentType, input.direction, input.entryPrice, input.quantity, input.stopLoss, input.takeProfit, input.commission, input.status ?? 'open', input.pnl ?? 0, input.rr ?? 0, input.comment ?? null);

  if ((input.status ?? 'open') === 'open') {
    db.prepare('INSERT INTO positions (userId, ticker, direction, avgEntryPrice, quantity, stopLoss, takeProfit) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(input.userId, input.ticker, input.direction, input.entryPrice, input.quantity, input.stopLoss, input.takeProfit);
  }
  return Number(result.lastInsertRowid);
}

export function saveBcsTrade(input: { telegramId: string; symbol: string; instrumentType: InstrumentType; direction: Direction; entryPrice: number; quantity: number; stopLoss: number; takeProfit: number; commissionRub?: number; comment?: string }, risk?: { riskReward?: number }): number {
  const user = ensureUser(input.telegramId);
  return saveTrade({ userId: user.id, ticker: input.symbol, instrumentType: input.instrumentType, direction: input.direction, entryPrice: input.entryPrice, quantity: input.quantity, stopLoss: input.stopLoss, takeProfit: input.takeProfit, commission: input.commissionRub ?? 0, comment: input.comment, rr: risk?.riskReward ?? 0 });
}

export function getTradeById(id: number): Trade | null {
  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as Trade | undefined;
  return row ?? null;
}

export function getOpenTrades(telegramId?: string): Trade[] {
  const user = telegramId ? ensureUser(telegramId) : null;
  return (user
    ? db.prepare("SELECT * FROM trades WHERE userId = ? AND status = 'open' ORDER BY createdAt DESC").all(user.id)
    : db.prepare("SELECT * FROM trades WHERE status = 'open' ORDER BY createdAt DESC").all()) as Trade[];
}

export function getPositions(telegramId: string) {
  const user = ensureUser(telegramId);
  return db.prepare('SELECT * FROM positions WHERE userId = ? ORDER BY createdAt DESC').all(user.id) as any[];
}

export function getLastNTrades(n: number, telegramId?: string): Trade[] {
  const user = telegramId ? ensureUser(telegramId) : null;
  return (user
    ? db.prepare("SELECT * FROM trades WHERE userId = ? AND status != 'open' ORDER BY COALESCE(closedAt, createdAt) DESC LIMIT ?").all(user.id, n)
    : db.prepare("SELECT * FROM trades WHERE status != 'open' ORDER BY COALESCE(closedAt, createdAt) DESC LIMIT ?").all(n)) as Trade[];
}

export function getTodayTrades(telegramId?: string): Trade[] {
  const user = telegramId ? ensureUser(telegramId) : null;
  return (user
    ? db.prepare("SELECT * FROM trades WHERE userId = ? AND DATE(createdAt) = DATE('now') ORDER BY createdAt DESC").all(user.id)
    : db.prepare("SELECT * FROM trades WHERE DATE(createdAt) = DATE('now') ORDER BY createdAt DESC").all()) as Trade[];
}

export function getMonthTrades(telegramId?: string): Trade[] {
  const user = telegramId ? ensureUser(telegramId) : null;
  return (user
    ? db.prepare("SELECT * FROM trades WHERE userId = ? AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now') ORDER BY createdAt DESC").all(user.id)
    : db.prepare("SELECT * FROM trades WHERE strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now') ORDER BY createdAt DESC").all()) as Trade[];
}

export function saveAiReview(review: { tradeId?: number; reviewText: string; score: number }): void {
  db.prepare('INSERT INTO ai_reviews (tradeId, reviewText, score) VALUES (?, ?, ?)').run(review.tradeId ?? null, review.reviewText, review.score);
}

export function getWinrateBySymbol(telegramId?: string): Array<{ symbol: string; winrate: number; trades: number; pnlRub: number; pnlPercent: number }> {
  const trades = getMonthTrades(telegramId).filter(t => t.status !== 'open');
  const byTicker = new Map<string, Trade[]>();
  for (const trade of trades) byTicker.set(trade.ticker, [...(byTicker.get(trade.ticker) ?? []), trade]);
  return [...byTicker.entries()].map(([symbol, rows]) => {
    const wins = rows.filter(t => t.pnl > 0).length;
    const pnlRub = rows.reduce((sum, t) => sum + t.pnl, 0);
    return { symbol, trades: rows.length, winrate: rows.length ? (wins / rows.length) * 100 : 0, pnlRub, pnlPercent: 0 };
  }).sort((a, b) => b.pnlRub - a.pnlRub);
}

export function saveAnalysisReport(report: AnalysisReport): void {
  db.prepare(`INSERT INTO analysis_reports (periodStart, periodEnd, totalTrades, wins, losses, winRate, avgProfit, avgLoss, profitFactor, bestSetups, worstSetups, frequentErrors, recommendations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    report.periodStart, report.periodEnd, report.totalTrades, report.wins, report.losses, report.winRate, report.avgProfit, report.avgLoss, report.profitFactor,
    JSON.stringify(report.bestSetups), JSON.stringify(report.worstSetups), JSON.stringify(report.frequentErrors), JSON.stringify(report.recommendations),
  );
}

export function getBotState() {
  return { isPaused: false, consecutiveLosses: 0, dailyLossPercent: 0, lastDailyReset: new Date().toISOString().slice(0, 10), totalBalance: config.trading.defaultDepositRub, mode: 'analytics' as const };
}

export function recordReject(): void {}
export function getRejectStats(): Array<{ reason: string; count: number }> { return []; }
export function getRejectStatsBySymbol(): Array<{ symbol: string; count: number }> { return []; }
export function getRejectStatsByTimeframe(): Array<{ timeframe: string; count: number }> { return []; }
export function getRejectCountSince(): number { return 0; }
export function getRecentSignals(): any[] { return []; }


export function saveBcsPortfolioSnapshot(portfolio: import('../broker/bcs/types').BcsPortfolio): void {
  db.prepare('INSERT INTO bcs_portfolio_snapshots (balance, freeCash, portfolioValue, dayPnl, totalPnl, currency) VALUES (?, ?, ?, ?, ?, ?)')
    .run(portfolio.money.balance, portfolio.money.freeCash, portfolio.money.portfolioValue, portfolio.money.dayPnl, portfolio.money.totalPnl, portfolio.money.currency);
  upsertBcsPositions(portfolio.positions);
}

export function upsertBcsPositions(positions: import('../broker/bcs/types').BcsPosition[]): number {
  const stmt = db.prepare(`INSERT INTO bcs_positions (ticker, name, quantity, averagePrice, currentPrice, unrealizedPnl, portfolioSharePercent, instrumentType, classCode, syncedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(ticker) DO UPDATE SET name = excluded.name, quantity = excluded.quantity, averagePrice = excluded.averagePrice, currentPrice = excluded.currentPrice, unrealizedPnl = excluded.unrealizedPnl, portfolioSharePercent = excluded.portfolioSharePercent, instrumentType = excluded.instrumentType, classCode = excluded.classCode, syncedAt = CURRENT_TIMESTAMP`);
  let changed = 0;
  for (const position of positions) {
    const result = stmt.run(position.ticker, position.name ?? null, position.quantity, position.averagePrice, position.currentPrice, position.unrealizedPnl, position.portfolioSharePercent, position.instrumentType ?? null, position.classCode ?? null);
    changed += Number(result.changes ?? 0);
  }
  return changed;
}

export function getLatestBcsPortfolioSnapshot(): any | null {
  return db.prepare('SELECT * FROM bcs_portfolio_snapshots ORDER BY syncedAt DESC LIMIT 1').get() ?? null;
}

export function getBcsPositions(): any[] {
  return db.prepare('SELECT * FROM bcs_positions ORDER BY portfolioSharePercent DESC').all() as any[];
}

export function upsertBcsTrades(trades: import('../broker/bcs/types').BcsTrade[]): number {
  const stmt = db.prepare(`INSERT OR IGNORE INTO bcs_trades (externalId, ticker, side, price, quantity, volume, commission, tradeDateTime, instrumentType, classCode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let inserted = 0;
  for (const trade of trades) {
    const result = stmt.run(trade.externalId, trade.ticker, trade.side, trade.price, trade.quantity, trade.volume, trade.commission ?? 0, trade.tradeDateTime, trade.instrumentType ?? null, trade.classCode ?? null);
    inserted += Number(result.changes ?? 0);
  }
  return inserted;
}

export function getBcsTrades(limit = 50): any[] {
  return db.prepare('SELECT * FROM bcs_trades ORDER BY tradeDateTime DESC LIMIT ?').all(limit) as any[];
}

export function getBcsTrades(limit = 50): any[] {
  return db.prepare('SELECT * FROM bcs_trades ORDER BY tradeDateTime DESC LIMIT ?').all(limit) as any[];
}

export function recordReject(): void {}
export function getRejectStats(): Array<{ reason: string; count: number }> { return []; }
export function getRejectStatsBySymbol(): Array<{ symbol: string; count: number }> { return []; }
export function getRejectStatsByTimeframe(): Array<{ timeframe: string; count: number }> { return []; }
export function getRejectCountSince(): number { return 0; }
export function getRecentSignals(): any[] { return []; }
