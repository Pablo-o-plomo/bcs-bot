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

  logger.info('🚀 Starting BCS Trading Assistant...');
  logger.info('   Mode: analytics-only, no automatic trading');
  logger.info(`   Instruments: ${config.trading.instruments.join(', ')}`);

  initDb();
  initTelegramBot();

  const app = express();
  app.get('/health', (_, res) => res.json({ status: 'ok', broker: config.broker, mode: 'analytics-only', build: BUILD_VERSION }));
  app.listen(config.server.port, () => logger.info(`🌐 Health check: http://localhost:${config.server.port}/health`));

  setupSchedulers();

  const startupMessage = `✅ BCS Trading Assistant restarted\nMode: analytics-only\nBuild: ${BUILD_VERSION}\n\n⚠️ Это не инвестиционная рекомендация. Автоторговля отключена.`;
  await sendAdminMessage(startupMessage).catch((err: any) => logger.warn(`Failed to send startup notification: ${err.message}`));
  if (config.telegram.sendStartupToChannel) await broadcastMessage(startupMessage);

  logger.info('✅ Bot fully initialized');
}

function setupSchedulers(): void {
  cron.schedule('55 23 * * *', async () => {
    const target = config.telegram.chatId || config.telegram.adminId;
    if (!target) return;
    await broadcastMessage(generateDailyReport());
  });
  logger.info('⏰ Schedulers started: daily report at 23:55 UTC');
}

process.on('unhandledRejection', (reason: any) => {
  logger.error(`Unhandled rejection: ${reason?.message || reason}`);
});

process.on('uncaughtException', err => {
  logger.error(`Uncaught exception: ${err.message}`);
});

bootstrap().catch(err => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
