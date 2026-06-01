import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { dealPrompt, marketPrompt, portfolioPrompt, riskPrompt } from './prompts';
import { fallbackDealAnalysis, fallbackMarketAnalysis, fallbackPortfolioAnalysis, fallbackRiskAnalysis } from './fallback';
import type { AiDealContext, AiMarketContext, AiPortfolioContext, AiRiskContext } from './types';


export async function analyzePortfolio(ctx: AiPortfolioContext): Promise<string> {
  return analyze('portfolio', portfolioPrompt(ctx), () => fallbackPortfolioAnalysis(ctx));
}

export async function analyzeMarket(ctx: AiMarketContext): Promise<string> {
  return analyze('market', marketPrompt(ctx), () => fallbackMarketAnalysis(ctx));
}

export async function analyzeRisk(ctx: AiRiskContext): Promise<string> {
  return analyze('risk', riskPrompt(ctx), () => fallbackRiskAnalysis(ctx));
}

export async function analyzeDeal(ctx: AiDealContext): Promise<string> {
  return analyze('deal', dealPrompt(ctx), () => fallbackDealAnalysis(ctx));
}

async function analyze(kind: string, prompt: string, fallback: () => string): Promise<string> {
  return safeAiAnalysis(kind, prompt, fallback, 5000);
}

export async function safeAiAnalysis(kind: string, prompt: string, fallback: () => string, timeoutMs = 5000): Promise<string> {
  logger.info(`ai_analysis_started: ${kind}`);
  if (!config.openai.apiKey) {
    logger.info(`ai_openai_unavailable: ${kind}`);
    logger.info(`ai_analysis_fallback: ${kind}`);
    const text = fallback();
    logger.info(`ai_analysis_finished: ${kind}`);
    return text;
  }

  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<string>(resolve => {
    timeoutId = globalThis.setTimeout(() => {
      logger.warn(`ai_analysis_timeout: ${kind}`);
      logger.info(`ai_analysis_fallback: ${kind}`);
      resolve(fallback());
    }, timeoutMs);
  });

  const openAiRequest = (async () => {
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
      return ensureDisclaimer(response.data?.choices?.[0]?.message?.content || fallback());
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || String(err?.message ?? err).toLowerCase().includes('timeout')) logger.warn(`ai_openai_timeout: ${kind}`);
      logger.warn(`ai_analysis_failed: ${kind}: ${err?.message ?? err}`);
      logger.info(`ai_analysis_fallback: ${kind}`);
      return fallback();
    }
  })();

  try {
    const text = await Promise.race([openAiRequest, timeout]);
    logger.info(`ai_analysis_finished: ${kind}`);
    return text;
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

function ensureDisclaimer(text: string): string {
  return text.includes('Это не инвестиционная рекомендация') ? text : `${text}\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
}
