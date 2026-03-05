/**
 * Structured logging wrapper for MCP tool invocations.
 *
 * Wraps every tool's execute body to emit structured log entries with
 * timing, success/failure, and request metadata. Never logs token values.
 *
 * @see Feature 21 — FR-200, FR-201
 * @see TR.md — Section 12.1
 */

interface LogToolCallOptions {
  tool: string;
  userId: string;
  clientParam?: string;
}

interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

// Default console-based logger for when Mastra's logger isn't available
const defaultLogger: Logger = {
  info(obj, msg) {
    console.log(JSON.stringify({ level: 'info', ...obj, msg }));
  },
  warn(obj, msg) {
    console.warn(JSON.stringify({ level: 'warn', ...obj, msg }));
  },
};

let _logger: Logger = defaultLogger;

/**
 * Set the logger instance used by logToolCall.
 * Called once during Mastra initialization.
 */
export function setToolLogger(logger: Logger): void {
  _logger = logger;
}

/**
 * Wrap a tool execution function with structured logging.
 *
 * @param options - Metadata for the log entry
 * @param fn - The async function to execute and log
 * @returns The result of fn()
 */
export async function logToolCall<T>(
  options: LogToolCallOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    const result = await fn();
    _logger.info({
      tool: options.tool,
      requestSource: 'mcp',
      userId: options.userId,
      clientParam: options.clientParam,
      startedAt,
      durationMs: Date.now() - startMs,
      success: true,
    });
    return result;
  } catch (err) {
    _logger.warn({
      tool: options.tool,
      requestSource: 'mcp',
      userId: options.userId,
      clientParam: options.clientParam,
      startedAt,
      durationMs: Date.now() - startMs,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}
