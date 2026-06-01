import axios from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getBcsAccessToken, resetBcsAccessToken, validateBcsTokenConfig } from './auth';
import { BcsApiError, BcsReadOnlyError, classifyBcsError, sanitizeSecret } from './errors';
import { getPortfolio } from './portfolio';
import { getPositions } from './positions';
import { getTrades } from './history';
import { getInstruments } from './instruments';
import { getMarketData } from './market';
import { getLimits } from './limits';
import type { BcsApiStatus, BcsInstrument, BcsLimits, BcsMarketData, BcsMoneySummary, BcsPortfolio, BcsReadOnlyOrderPayload, BcsTrade } from './types';

type RequestMethod = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';

export class BcsApiClient {
  readonly baseUrl = config.bcsApi.baseUrl;
  private status: BcsApiStatus = this.initialStatus();

  isEnabled(): boolean { return config.bcsApi.enabled; }

  getStatus(): BcsApiStatus { return { ...this.status, enabled: config.bcsApi.enabled, readOnly: config.readOnlyMode, orderExecutionEnabled: config.allowOrderExecution && !config.readOnlyMode }; }

  markSyncSuccess(): void {
    this.status = { ...this.getStatus(), connected: true, lastSyncAt: new Date().toISOString(), lastError: undefined };
  }

  validateToken(): void { validateBcsTokenConfig(); }

  async connect(): Promise<BcsApiStatus> {
    if (!config.bcsApi.enabled) {
      this.status = { ...this.initialStatus(), lastCheckedAt: new Date().toISOString() };
      logger.info('BCS API disabled by config');
      return this.getStatus();
    }
    try {
      validateBcsTokenConfig();
      await getBcsAccessToken(true);
      this.status = { ...this.getStatus(), connected: true, accountVerified: Boolean(config.bcsApi.accountId), lastCheckedAt: new Date().toISOString(), lastError: undefined };
      logger.info('✅ BCS API connected');
      logger.info(`${this.status.accountVerified ? '✅' : '⚠️'} Account ${this.status.accountVerified ? 'verified' : 'id is not configured'}`);
      logger.info(`${config.readOnlyMode ? '✅' : '⚠️'} Read only mode ${config.readOnlyMode ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      this.status = { ...this.getStatus(), connected: false, accountVerified: false, lastCheckedAt: new Date().toISOString(), lastError: sanitizeSecret(err?.message ?? err) };
      logger.error(`❌ BCS API auth failed: ${this.status.lastError}`);
    }
    return this.getStatus();
  }

  async request<T>(method: RequestMethod, path: string, data?: unknown, params?: Record<string, unknown>): Promise<T> {
    if (!config.bcsApi.enabled) throw new BcsApiError('BCS API disabled');
    let token = await getBcsAccessToken();
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    let attempt = 0;
    while (true) {
      try {
        logger.info(`BCS API request: method=${method}, path=${redactUrl(url)}`);
        const response = await axios.request<T>({ method, url, data, params, timeout: config.bcsApi.timeoutMs, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        this.status = { ...this.getStatus(), connected: true, lastCheckedAt: new Date().toISOString(), lastError: undefined };
        return response.data;
      } catch (err: any) {
        const apiError = classifyBcsError(err);
        if (apiError.statusCode === 401 && attempt === 0) {
          resetBcsAccessToken();
          token = await getBcsAccessToken(true);
          attempt += 1;
          continue;
        }
        const retryable = apiError.statusCode === 429 || (apiError.statusCode !== undefined && apiError.statusCode >= 500) || err?.code === 'ECONNABORTED';
        if (!retryable || attempt >= config.bcsApi.maxRetries) {
          this.status = { ...this.getStatus(), connected: false, lastCheckedAt: new Date().toISOString(), lastError: apiError.message };
          logger.error(`BCS API error: ${apiError.message}`);
          throw apiError;
        }
        const delay = apiError.statusCode === 429 ? (apiError.retryAfter ? apiError.retryAfter * 1000 : 1500 * (attempt + 1)) : 500 * (attempt + 1);
        logger.warn(`BCS API retry: attempt=${attempt + 1}, status=${apiError.statusCode ?? 'network'}, delayMs=${delay}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt += 1;
      }
    }
  }

  async ping(): Promise<boolean> {
    if (!config.bcsApi.enabled) return false;
    await getPortfolio(this);
    this.status = { ...this.getStatus(), connected: true, accountVerified: Boolean(config.bcsApi.accountId), lastCheckedAt: new Date().toISOString(), lastPingAt: new Date().toISOString(), lastError: undefined };
    return true;
  }

  getPortfolio(): Promise<BcsPortfolio> { return getPortfolio(this); }
  getPositions() { return getPositions(this); }
  async getBalance(): Promise<BcsMoneySummary> { return (await this.getPortfolio()).money; }
  getLimits(): Promise<BcsLimits> { return getLimits(this); }
  getTrades(): Promise<BcsTrade[]> { return getTrades(this); }
  getInstruments(query?: string): Promise<BcsInstrument[]> { return getInstruments(this, query); }
  getMarketData(ticker: string): Promise<BcsMarketData> { return getMarketData(this, ticker); }

  async placeOrder(_payload?: BcsReadOnlyOrderPayload): Promise<never> { throwReadOnly(); }
  async cancelOrder(_orderId?: string): Promise<never> { throwReadOnly(); }
  async executeOrder(): Promise<never> { throwReadOnly(); }

  private initialStatus(): BcsApiStatus {
    return { enabled: config.bcsApi.enabled, connected: false, accountVerified: false, readOnly: config.readOnlyMode, orderExecutionEnabled: config.allowOrderExecution && !config.readOnlyMode, accountId: config.bcsApi.accountId, clientId: config.bcsApi.clientId };
  }
}

export const bcsApiClient = new BcsApiClient();

function throwReadOnly(): never {
  if (config.readOnlyMode) throw new BcsReadOnlyError('READ ONLY MODE ENABLED');
  if (!config.allowOrderExecution) throw new Error('Order execution disabled');
  throw new Error('Order execution disabled');
}

function redactUrl(url: string): string { return sanitizeSecret(url); }
