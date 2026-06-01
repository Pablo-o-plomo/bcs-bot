import { bcsApiClient } from '../broker/bcs/client';
import { upsertBcsPositions } from '../database/db';
import { logger } from '../utils/logger';

let syncInProgress = false;

export async function syncPositions(): Promise<void> {
  if (syncInProgress || !bcsApiClient.isEnabled()) return;
  syncInProgress = true;
  try {
    const positions = await bcsApiClient.getPositions();
    const changed = upsertBcsPositions(positions);
    bcsApiClient.markSyncSuccess();
    logger.info(`BCS sync positions: received=${positions.length}, changed=${changed}`);
  } catch (err: any) {
    logger.warn(`BCS sync positions failed: ${err.message}`);
  } finally {
    syncInProgress = false;
  }
}
