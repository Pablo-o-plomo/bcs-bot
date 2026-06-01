import axios from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { BcsAuthError, classifyBcsError, sanitizeSecret } from './errors';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let cache: TokenCache | null = null;

export function validateBcsTokenConfig(): void {
  if (!config.bcsApi.enabled) throw new Error('BCS API disabled');
  if (!config.bcsApi.token) throw new BcsAuthError('BCS API token is not configured');
  if (!config.bcsApi.accountId) logger.warn('BCS_ACCOUNT_ID is not configured; portfolio sync may still work but account verification is incomplete');
  if (config.bcsApi.clientId !== 'trade-api-read') logger.warn('BCS_CLIENT_ID is not trade-api-read; READ_ONLY_MODE guard is enforced');
}

export async function getBcsAccessToken(forceRefresh = false): Promise<string> {
  validateBcsTokenConfig();
  const now = Date.now();
  if (!forceRefresh && cache && cache.expiresAt - 60_000 > now) return cache.accessToken;

  const body = new URLSearchParams({
    client_id: config.bcsApi.clientId,
    refresh_token: config.bcsApi.token,
    grant_type: 'refresh_token',
  });

  try {
    const response = await axios.post(getBcsAuthUrl(), body.toString(), {
      timeout: config.bcsApi.timeoutMs,
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const accessToken = response.data?.access_token;
    if (!accessToken) throw new BcsAuthError('BCS auth response does not include access_token');
    cache = { accessToken, expiresAt: now + Number(response.data?.expires_in ?? 3600) * 1000 };
    logger.info('BCS API auth: access token refreshed');
    return accessToken;
  } catch (err: any) {
    const classified = classifyBcsError(err);
    const message = classified.statusCode === 404
      ? 'BCS auth endpoint not found. Check BCS_AUTH_URL or BCS_API_BASE_URL.'
      : classified.message;
    logger.error(`BCS API auth error: ${message}`);
    throw new BcsAuthError(message);
  }
}

function getBcsAuthUrl(): string {
  return config.bcsApi.authUrl || `${config.bcsApi.baseUrl}/trade-api-keycloak/realms/tradeapi/protocol/openid-connect/token`;
}

export function resetBcsAccessToken(): void {
  cache = null;
}

export function sanitizeBcsError(err: any): string {
  const status = err?.response?.status ?? err?.statusCode;
  const type = err?.response?.data?.type ?? err?.response?.data?.error;
  const message = err?.response?.data?.message ?? err?.response?.data?.error_description ?? err?.message ?? 'unknown error';
  return [status ? `status=${status}` : undefined, type ? `type=${type}` : undefined, `message=${sanitizeSecret(message)}`].filter(Boolean).join(', ');
}
