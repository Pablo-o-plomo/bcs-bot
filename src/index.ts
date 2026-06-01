import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import express from 'express';
import { config } from './config';
import { initDb } from './database/db';
import { initTelegramBot, sendAdminMessage, broadcastMessage } from './telegram/bot';
import { generateDailyReport } from './reports/dailyReport';
import { logger } from './utils/logger';
import { BUILD_VERSION } from './version';
import { syncPortfolio } from './sync/portfolioSync';
import { syncTrades } from './sync/tradeSync';
import { syncPositions } from './sync/positionSync';
import { bcsApiClient } from './broker/bcs/client';
import { sanitizeSecret } from './broker/bcs/errors';


function maskAccountId(accountId: string): string {
  if (!accountId) return 'missing';
  if (accountId.length <= 4) return `${accountId.slice(0, 1)}***`;
  return `${accountId.slice(0, 4)}****`;
}

function logBcsApiConfig(): void {
  logger.info('🔌 BCS API config:');
  logger.info(`   enabled: ${config.bcsApi.enabled}`);
  logger.info(`   token: ${config.bcsApi.token ? 'present' : 'missing'}`);
  logger.info(`   accountId: ${maskAccountId(config.bcsApi.accountId)}`);
  logger.info(`   readOnly: ${config.readOnlyMode}`);
  logger.info(`   orderExecution: ${config.allowOrderExecution}`);
  logger.info(`   executionMode: ${config.execution.mode}`);
  logger.info(`   baseUrl: ${config.bcsApi.baseUrl ? 'present' : 'missing'}`);
}

async function pingBcsApiOnStartup(): Promise<void> {
  if (!config.bcsApi.enabled) return;
  try {
    await bcsApiClient.ping();
    logger.info('✅ BCS API ping successful');
  } catch (err: any) {
    logger.warn(`⚠️ BCS API ping failed: ${sanitizeSecret(err?.message ?? err)}`);
  }
}

async function bootstrap(): Promise<void> {
  fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
  logger.info('🚀 Starting BCS Assistant Bot...');
  logger.info(`   Broker: ${config.broker}`);
  logger.info(`   Auto trading: ${config.autoTrading ? 'enabled (not implemented)' : 'disabled'}`);
  logger.info(`   MOEX enabled: ${config.moex.enabled}`);
  logBcsApiConfig();

  initDb();
  await bcsApiClient.connect();
  await pingBcsApiOnStartup();
  initTelegramBot();

  const app = express();
  app.get('/health', (_, res) => res.json({
    status: 'ok',
    broker: config.broker,
    autoTrading: false,
    moexEnabled: config.moex.enabled,
    bcsApiEnabled: config.bcsApi.enabled,
    readOnlyMode: config.readOnlyMode,
    orderExecutionEnabled: config.allowOrderExecution && !config.readOnlyMode,
    bcsApiConnected: bcsApiClient.getStatus().connected,
    bcsApiLastError: bcsApiClient.getStatus().lastError,
    executionMode: config.execution.mode,
    allowedSymbols: config.execution.allowedSymbols,
    emergencyStopEnabled: config.execution.emergencyStopEnabled,
    build: BUILD_VERSION,
  }));
  app.listen(config.server.port, () => logger.info(`🌐 Health check: http://localhost:${config.server.port}/health`));

  cron.schedule('55 23 * * *', async () => {
    if (config.telegram.chatId || config.telegram.adminId) await broadcastMessage(generateDailyReport());
  });

  setInterval(() => {
    syncPortfolio().catch(() => undefined);
    syncPositions().catch(() => undefined);
    syncTrades().catch(() => undefined);
  }, 60_000);
  syncPortfolio().catch(() => undefined);
  syncPositions().catch(() => undefined);
  syncTrades().catch(() => undefined);

  await sendAdminMessage(`✅ BCS Assistant Bot restarted\nBuild: ${BUILD_VERSION}\nАвтоторговля отключена.\n\n⚠️ Это не инвестиционная рекомендация.`).catch((err: any) => logger.warn(`Startup notification failed: ${err.message}`));
  logger.info('✅ Bot fully initialized');
}

process.on('unhandledRejection', (reason: any) => logger.error(`Unhandled rejection: ${reason?.message || reason}`));
process.on('uncaughtException', err => logger.error(`Uncaught exception: ${err.message}`));

bootstrap().catch(err => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
