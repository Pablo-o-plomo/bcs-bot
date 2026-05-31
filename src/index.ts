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

async function bootstrap(): Promise<void> {
  fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
  logger.info('🚀 Starting BCS Assistant Bot...');
  logger.info(`   Broker: ${config.broker}`);
  logger.info(`   Auto trading: ${config.autoTrading ? 'enabled (not implemented)' : 'disabled'}`);
  logger.info(`   MOEX enabled: ${config.moex.enabled}`);

  initDb();
  initTelegramBot();

  const app = express();
  app.get('/health', (_, res) => res.json({
    status: 'ok',
    broker: config.broker,
    autoTrading: false,
    moexEnabled: config.moex.enabled,
    build: BUILD_VERSION,
  }));
  app.listen(config.server.port, () => logger.info(`🌐 Health check: http://localhost:${config.server.port}/health`));

  cron.schedule('55 23 * * *', async () => {
    if (config.telegram.chatId || config.telegram.adminId) await broadcastMessage(generateDailyReport());
  });

  await sendAdminMessage(`✅ BCS Assistant Bot restarted\nBuild: ${BUILD_VERSION}\nАвтоторговля отключена.\n\n⚠️ Это не инвестиционная рекомендация.`).catch((err: any) => logger.warn(`Startup notification failed: ${err.message}`));
  logger.info('✅ Bot fully initialized');
}

process.on('unhandledRejection', (reason: any) => logger.error(`Unhandled rejection: ${reason?.message || reason}`));
process.on('uncaughtException', err => logger.error(`Uncaught exception: ${err.message}`));

bootstrap().catch(err => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
