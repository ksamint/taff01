import pino, { type DestinationStream, type Logger } from "pino";

/**
 * Paths pino replaces with "[Redacted]". The model key (ADR 0016) is listed
 * under every name it could be logged with, although no code logs it: the
 * adapter keeps it in a closure and drops errors that might echo it.
 */
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "*.headers.authorization",
  "password",
  "token",
  "apiKey",
  "*.apiKey",
  "AI_API_KEY",
  "*.AI_API_KEY",
];

export function createLogger(destination?: DestinationStream): Logger {
  return pino({ redact: LOG_REDACT_PATHS }, destination);
}
