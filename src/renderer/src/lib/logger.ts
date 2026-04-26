/**
 * logger.ts — Application-level logger for ManyAI Desktop.
 *
 * Log entries are written to {workingDir}/manyai.log as plain text lines.
 * If no working directory is configured, log calls are silently dropped
 * (they never throw).
 *
 * Format: [ISO-8601 timestamp] [LEVEL] message
 *
 * Usage:
 *   import { logger } from '../lib/logger'
 *   logger.info('Provider response received', { provider: 'openai', latencyMs: 320 })
 *   logger.error('Image generation failed', { provider: 'pollinations', error: msg })
 */

import { getLogPath } from './workingDir'

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

/** Build a single log line. Does not include a trailing newline. */
function formatLine(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const suffix = meta ? ' ' + JSON.stringify(meta) : ''
  return `[${ts}] [${level}] ${message}${suffix}`
}

/**
 * Write a log entry to disk.
 * Fire-and-forget — awaiting is optional, errors are swallowed so they
 * never surface to the user.
 */
async function write(level: LogLevel, message: string, meta?: Record<string, unknown>): Promise<void> {
  const logPath = getLogPath()
  if (!logPath) return
  try {
    await window.api.appendFile(logPath, formatLine(level, message, meta) + '\n')
  } catch {
    // Logging must never crash the app.
  }
}

export const logger = {
  /** Routine informational messages (provider calls, saves, etc.). */
  info:  (message: string, meta?: Record<string, unknown>) => write('INFO',  message, meta),

  /** Non-fatal issues worth noting (partial failures, fallbacks). */
  warn:  (message: string, meta?: Record<string, unknown>) => write('WARN',  message, meta),

  /** Errors that prevented an operation from completing. */
  error: (message: string, meta?: Record<string, unknown>) => write('ERROR', message, meta),

  /** Verbose detail — provider request/response payloads, routing decisions. */
  debug: (message: string, meta?: Record<string, unknown>) => write('DEBUG', message, meta),

  /** Log an AI provider call result (convenience wrapper). */
  providerCall: (
    provider: string,
    model: string,
    prompt: string,
    result: { latencyMs?: number; error?: string },
  ) => {
    const level: LogLevel = result.error ? 'ERROR' : 'INFO'
    const message = result.error
      ? `Provider call failed: ${provider}/${model}`
      : `Provider call OK: ${provider}/${model}`
    return write(level, message, {
      provider,
      model,
      promptLen: prompt.length,
      latencyMs: result.latencyMs,
      error: result.error,
    })
  },
}
