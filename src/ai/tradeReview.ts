import axios from 'axios';
import { config } from '../config';
import { calculateRiskReward } from '../risk/riskManager';
import type { TradeInput, UserSettings } from '../database/models';

export interface TradeReviewResult {
  reviewText: string;
  score: number;
}

export async function reviewTrade(trade: Partial<TradeInput> | null, rawText: string, settings: UserSettings): Promise<TradeReviewResult> {
  if (config.openai.apiKey) {
    try {
      return await openAiReview(trade, rawText, settings);
    } catch {
      return ruleBasedReview(trade, rawText, settings, 'AI недоступен, использован локальный rule-based разбор.');
    }
  }
  return ruleBasedReview(trade, rawText, settings);
}

async function openAiReview(trade: Partial<TradeInput> | null, rawText: string, settings: UserSettings): Promise<TradeReviewResult> {
  const prompt = `Ты помощник трейдера БКС. Разбери сделку без обещаний прибыли. Обязательно оцени: логика входа, риск, RR, стоп, тейк, ошибки, рекомендация брать/пропустить/доработать. Добавь дисклеймер "Это не инвестиционная рекомендация". Сделка: ${JSON.stringify(trade)}. Описание пользователя: ${rawText}. Настройки риска: ${JSON.stringify(settings)}.`;
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  }, {
    headers: { Authorization: `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  const text = response.data?.choices?.[0]?.message?.content || 'AI не вернул текст разбора.';
  return { reviewText: ensureDisclaimer(text), score: scoreFromText(text) };
}

function ruleBasedReview(trade: Partial<TradeInput> | null, rawText: string, settings: UserSettings, prefix?: string): TradeReviewResult {
  const issues: string[] = [];
  let score = 7;
  let rrText = 'нет данных';

  if (trade?.entryPrice && trade.stopLoss && trade.takeProfit && trade.direction) {
    const rr = calculateRiskReward({ entryPrice: trade.entryPrice, stopLoss: trade.stopLoss, takeProfit: trade.takeProfit, direction: trade.direction });
    rrText = `1:${rr.rr.toFixed(2)}`;
    if (rr.rr < 1.5) { issues.push('RR ниже 1.5 — тейк слишком близко к риску.'); score -= 2; }
    if (rr.riskPerUnit <= 0) { issues.push('Стоп расположен некорректно для направления сделки.'); score -= 3; }
  } else {
    issues.push('Недостаточно структурированных данных: укажите тикер, тип, направление, вход, количество, стоп и тейк.');
    score -= 2;
  }

  if (!trade?.stopLoss) { issues.push('Нет стоп-лосса — сделку нельзя разрешать.'); score -= 3; }
  if (rawText.toLowerCase().includes('усред')) { issues.push('Усреднение убыточной позиции повышает риск.'); score -= 1; }

  const recommendation = score >= 7 ? 'брать можно только при подтверждении плана' : score >= 4 ? 'доработать' : 'пропустить';
  const reviewText = `${prefix ? `${prefix}\n\n` : ''}🧠 <b>AI-разбор сделки</b>\n\nЛогика входа: ${trade?.comment || rawText || 'нет описания'}\nРиск: лимит пользователя ${settings.riskPerTrade}% на сделку.\nRR: ${rrText}.\nСтоп: ${trade?.stopLoss ? 'задан, проверьте что он стоит за техническим уровнем' : 'не задан'}.\nТейк: ${trade?.takeProfit ? 'задан, сравните с ближайшими уровнями сопротивления/поддержки' : 'не задан'}.\nВозможные ошибки:\n${issues.length ? issues.map(item => `• ${item}`).join('\n') : '• критичных нарушений в структуре сделки не найдено'}\nРекомендация: <b>${recommendation}</b>.\nОценка: <b>${Math.max(0, Math.min(10, score))}/10</b>.\n\n⚠️ <i>Это не инвестиционная рекомендация.</i>`;
  return { reviewText, score: Math.max(0, Math.min(10, score)) };
}

function ensureDisclaimer(text: string): string {
  return text.includes('Это не инвестиционная рекомендация') ? text : `${text}\n\n⚠️ Это не инвестиционная рекомендация.`;
}

function scoreFromText(text: string): number {
  if (/пропустить/i.test(text)) return 3;
  if (/доработать/i.test(text)) return 6;
  return 7;
}
