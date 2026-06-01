import axios from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getBcsAccessToken, sanitizeBcsError, validateBcsTokenConfig } from './auth';
import { getPortfolio } from './portfolio';
import { getPositions } from './positions';
import { getTrades } from './history';
import { getInstruments, getMarketData } from './instruments';
import type { BcsInstrument, BcsMarketData, BcsPortfolio, BcsTrade } from './types';

export class BcsApiClient {
  readonly baseUrl = config.bcsApi.baseUrl;

  isEnabled(): boolean {
    return config.bcsApi.enabled;
  }

  validateToken(): void {
    validateBcsTokenConfig();
  }

  async request<T>(method: 'GET' | 'POST', path: string, data?: unknown, params?: Record<string, unknown>): Promise<T> {
    if (!config.bcsApi.enabled) throw new Error('BCS API disabled');
    const token = await getBcsAccessToken();
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    let attempt = 0;
    while (true) {
      try {
        logger.info(`BCS API request: method=${method}, path=${redactUrl(url)}`);
        const response = await axios.request<T>({ method, url, data, params, timeout: config.bcsApi.timeoutMs, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        return response.data;
      } catch (err: any) {
        const status = err?.response?.status;
        const retryable = status === 429 || status >= 500 || err?.code === 'ECONNABORTED';
        if (!retryable || attempt >= config.bcsApi.maxRetries) {
          logger.error(`BCS API error: ${sanitizeBcsError(err)}`);
          throw new Error(`BCS API request failed: ${sanitizeBcsError(err)}`);
        }
        const delay = status === 429 ? 1500 * (attempt + 1) : 500 * (attempt + 1);
        logger.warn(`BCS API retry: attempt=${attempt + 1}, status=${status ?? 'network'}, delayMs=${delay}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt += 1;
      }
    }
  }

  getPortfolio(): Promise<BcsPortfolio> { return getPortfolio(this); }
  getPositions() { return getPositions(this); }
  getTrades(): Promise<BcsTrade[]> { return getTrades(this); }
  getInstruments(query?: string): Promise<BcsInstrument[]> { return getInstruments(this, query); }
  getMarketData(ticker: string): Promise<BcsMarketData> { return getMarketData(this, ticker); }

  async executeOrder(): Promise<never> {
    if (!config.allowOrderExecution) throw new Error('Order execution disabled');
    throw new Error('Order execution disabled');
  }
}

export const bcsApiClient = new BcsApiClient();

function redactUrl(url: string): string {
  return url.replace(config.bcsApi.token, '[redacted]');
}
