import { bcsApiClient } from '../broker/bcs/client';
import { saveBcsPortfolioSnapshot } from '../database/db';
import { logger } from '../utils/logger';

let syncInProgress = false;

export async function syncPortfolio(): Promise<void> {
  if (syncInProgress || !bcsApiClient.isEnabled()) return;
  syncInProgress = true;
  try {
    const portfolio = await bcsApiClient.getPortfolio();
    saveBcsPortfolioSnapshot(portfolio);
    bcsApiClient.markSyncSuccess();
    logger.info(`BCS sync portfolio: positions=${portfolio.positions.length}`);
  } catch (err: any) {
    logger.warn(`BCS sync portfolio failed: ${err.message}`);
  } finally {
    syncInProgress = false;
  }
}
