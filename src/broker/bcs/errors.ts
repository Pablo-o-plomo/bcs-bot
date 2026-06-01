import { config } from '../../config';

export class BcsApiError extends Error {
  constructor(message: string, readonly statusCode?: number, readonly retryAfter?: number) {
    super(message);
    this.name = 'BcsApiError';
  }
}

export class BcsAuthError extends BcsApiError {
  constructor(message = 'BCS API auth failed') {
    super(message, 401);
    this.name = 'BcsAuthError';
  }
}

export class BcsForbiddenError extends BcsApiError {
  constructor(message = 'BCS API forbidden') {
    super(message, 403);
    this.name = 'BcsForbiddenError';
  }
}

export class BcsRateLimitError extends BcsApiError {
  constructor(retryAfter?: number) {
    super('BCS API rate limit', 429, retryAfter);
    this.name = 'BcsRateLimitError';
  }
}

export class BcsReadOnlyError extends Error {
  constructor(message = 'READ ONLY MODE ENABLED') {
    super(message);
    this.name = 'BcsReadOnlyError';
  }
}

export function sanitizeSecret(value: unknown): string {
  let message = String(value ?? 'unknown error');
  const secrets = [config.bcsApi.token, process.env.BCS_API_TOKEN].filter(Boolean) as string[];
  for (const secret of secrets) message = message.split(secret).join('[redacted]');
  return message;
}

export function classifyBcsError(err: any): BcsApiError {
  const status = Number(err?.response?.status ?? err?.statusCode ?? 0) || undefined;
  const retryAfterRaw = err?.response?.headers?.['retry-after'];
  const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : undefined;
  const apiType = err?.response?.data?.type ?? err?.response?.data?.error;
  const apiMessage = err?.response?.data?.message ?? err?.response?.data?.error_description ?? err?.message ?? 'unknown error';
  const message = [status ? `status=${status}` : undefined, apiType ? `type=${apiType}` : undefined, `message=${sanitizeSecret(apiMessage)}`].filter(Boolean).join(', ');
  if (status === 401) return new BcsAuthError(message);
  if (status === 403) return new BcsForbiddenError(message);
  if (status === 429) return new BcsRateLimitError(retryAfter);
  return new BcsApiError(message, status, retryAfter);
}
