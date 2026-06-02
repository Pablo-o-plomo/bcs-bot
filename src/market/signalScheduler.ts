import { config } from '../config';
import { logger } from '../utils/logger';
import { scanMarket } from './scanner';
import type { ScannerSignal } from './types';

interface SentSignalRecord {
  ticker: string;
  sentAt: number;
}

type SendSignal = () => Promise<void>;

const sentSignals: SentSignalRecord[] = [];
let schedulerStarted = false;
let scanInProgress = false;

export function startMarketSignalScheduler(sendSignal: SendSignal): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  if (!config.marketScan.enabled) {
    logger.info('market_signal_scheduler_disabled');
    return;
  }
  const intervalMs = Math.max(60, config.marketScan.intervalSeconds) * 1000;
  logger.info(`market_signal_scheduler_started: intervalSeconds=${config.marketScan.intervalSeconds}`);
  setInterval(() => runMarketSignalScan(sendSignal).catch(err => logger.warn(`market_signal_scheduler_failed: ${err?.message ?? err}`)), intervalMs);
  setTimeout(() => runMarketSignalScan(sendSignal).catch(err => logger.warn(`market_signal_scheduler_failed: ${err?.message ?? err}`)), 15_000);
}

async function runMarketSignalScan(sendSignal: SendSignal): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;
  try {
    pruneSignalCache();
    const { signals } = await scanMarket();
    const best = pickScheduledSignal(signals);
    if (!best) {
      logger.info('market_signal_not_found');
      return;
    }
    if (isDuplicate(best.ticker)) {
      logger.info(`market_signal_duplicate_skipped: ticker=${best.ticker}`);
      return;
    }
    if (sentSignalsLastHour() >= config.marketScan.maxSignalsPerHour) {
      logger.info('market_signal_hourly_limit_reached');
      return;
    }
    sentSignals.push({ ticker: best.ticker, sentAt: Date.now() });
    logger.info(`market_signal_found: ticker=${best.ticker}, confidence=${best.confidence}`);
    await sendSignal();
    logger.info(`market_signal_sent: ticker=${best.ticker}`);
  } finally {
    scanInProgress = false;
  }
}

function pickScheduledSignal(signals: ScannerSignal[]): ScannerSignal | undefined {
  return signals
    .filter(signal => signal.action !== 'SKIP')
    .filter(signal => signal.confidence >= config.trading.minSignalConfidence)
    .filter(signal => Math.abs(signal.momentum) >= 0.5)
    .filter(signal => signal.risk !== 'high')
    .sort((a, b) => b.confidence - a.confidence)[0];
}

function isDuplicate(ticker: string): boolean {
  const cooldownMs = config.marketScan.cooldownMinutes * 60_000;
  const normalized = ticker.toUpperCase();
  return sentSignals.some(record => record.ticker.toUpperCase() === normalized && Date.now() - record.sentAt < cooldownMs);
}

function sentSignalsLastHour(): number {
  const hourAgo = Date.now() - 60 * 60_000;
  return sentSignals.filter(record => record.sentAt >= hourAgo).length;
}

function pruneSignalCache(): void {
  const keepAfter = Date.now() - Math.max(60, config.marketScan.cooldownMinutes) * 60_000 * 2;
  for (let index = sentSignals.length - 1; index >= 0; index -= 1) {
    if (sentSignals[index].sentAt < keepAfter) sentSignals.splice(index, 1);
  }
}
