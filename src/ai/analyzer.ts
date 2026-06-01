import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { dealPrompt, marketPrompt, portfolioPrompt, riskPrompt } from './prompts';
import { formatDealFallback, formatMarketFallback, formatPortfolioFallback, formatRiskFallback } from './formatter';
import type { AiDealContext, AiMarketContext, AiPortfolioContext, AiRiskContext } from './types';

export async function analyzePortfolio(ctx: AiPortfolioContext): Promise<string> {
  return analyze('portfolio', portfolioPrompt(ctx), () => formatPortfolioFallback(ctx));
}

export async function analyzeMarket(ctx: AiMarketContext): Promise<string> {
  return analyze('market', marketPrompt(ctx), () => formatMarketFallback(ctx));
}

export async function analyzeRisk(ctx: AiRiskContext): Promise<string> {
  return analyze('risk', riskPrompt(ctx), () => formatRiskFallback(ctx));
}

export async function analyzeDeal(ctx: AiDealContext): Promise<string> {
  return analyze('deal', dealPrompt(ctx), () => formatDealFallback(ctx));
}

async function analyze(kind: string, prompt: string, fallback: () => string): Promise<string> {
  logger.info(`ai_analysis_started: ${kind}`);
  if (!config.openai.apiKey) {
    logger.info(`ai_fallback_used: ${kind}`);
    const text = fallback();
    logger.info(`ai_analysis_finished: ${kind}`);
    return text;
  }

  try {
    logger.info(`ai_openai_used: ${kind}`);
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }, {
      headers: { Authorization: `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 7000,
    });
    const text = ensureDisclaimer(response.data?.choices?.[0]?.message?.content || fallback());
    logger.info(`ai_analysis_finished: ${kind}`);
    return text;
  } catch (err: any) {
    if (err?.code === 'ECONNABORTED' || String(err?.message ?? err).toLowerCase().includes('timeout')) logger.warn(`ai_openai_timeout: ${kind}`);
    logger.warn(`ai_analysis_failed: ${kind}: ${err?.message ?? err}`);
    logger.info(`ai_fallback_used: ${kind}`);
    const text = fallback();
    logger.info(`ai_analysis_finished: ${kind}`);
    return text;
  }
}

function ensureDisclaimer(text: string): string {
  return text.includes('Это не инвестиционная рекомендация') ? text : `${text}\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}
