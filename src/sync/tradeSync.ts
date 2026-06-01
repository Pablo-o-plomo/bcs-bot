import { bcsApiClient } from '../broker/bcs/client';
import { upsertBcsTrades } from '../database/db';
import { logger } from '../utils/logger';

let syncInProgress = false;

export async function syncTrades(): Promise<void> {
  if (syncInProgress || !bcsApiClient.isEnabled()) return;
  syncInProgress = true;
  try {
    const trades = await bcsApiClient.getTrades();
    const inserted = upsertBcsTrades(trades);
    bcsApiClient.markSyncSuccess();
    logger.info(`BCS sync trades: received=${trades.length}, inserted=${inserted}`);
  } catch (err: any) {
    logger.warn(`BCS sync trades failed: ${err.message}`);
  } finally {
    syncInProgress = false;
  }
}
