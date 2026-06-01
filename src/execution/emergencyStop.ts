import { config } from '../config';
import { logger } from '../utils/logger';

let stopped = false;
let reason = '';
let apiErrors = 0;
let rejects = 0;

export function isEmergencyStopped(): boolean {
  return config.execution.emergencyStopEnabled && stopped;
}

export function getEmergencyStopStatus(): { enabled: boolean; stopped: boolean; reason: string; apiErrors: number; rejects: number } {
  return { enabled: config.execution.emergencyStopEnabled, stopped, reason, apiErrors, rejects };
}

export function recordApiError(error: string): void {
  apiErrors += 1;
  logger.warn(`execution emergency api_error count=${apiErrors}: ${error}`);
  if (apiErrors >= 5) triggerEmergencyStop('API errors подряд');
}

export function recordReject(rejectReason: string): void {
  rejects += 1;
  logger.warn(`execution reject count=${rejects}: ${rejectReason}`);
  if (rejects >= 10) triggerEmergencyStop('repeated rejects');
}

export function triggerEmergencyStop(stopReason: string): void {
  if (!config.execution.emergencyStopEnabled) return;
  stopped = true;
  reason = stopReason;
  logger.error(`🚨 Trading stopped by emergency system: ${stopReason}`);
}

export function resetEmergencyStop(): void {
  stopped = false;
  reason = '';
  apiErrors = 0;
  rejects = 0;
  logger.warn('Emergency stop reset manually');
}
