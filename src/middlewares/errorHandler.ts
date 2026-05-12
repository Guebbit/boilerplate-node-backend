import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/winston";
import { getActiveSpanContext } from "../utils/tracer";

/** Typed operational error with an HTTP status code. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Global error handler.
 *
 * Status-code policy:
 *  - 400 Bad Request   — validation / malformed input
 *  - 401 Unauthorized  — not authenticated (prompt login, NOT a server error)
 *  - 403 Forbidden     — authenticated but lacks permission
 *  - 404 Not Found     — resource missing
 *  - 422 Unprocessable — domain business rule violation
 *  - 500 Internal      — unexpected server error (log at error level, alert ops)
 *
 * Frontends should only show an error/500 page for actual 5xx responses.
 * A 401 should redirect to the login flow, not display an error page.
 */
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const { traceId } = getActiveSpanContext();

  if (err instanceof HttpError) {
    const statusCode = err.statusCode;

    // 4xx are application-level states — log at warn (not error)
    if (statusCode < 500) {
      logger.warn(`${statusCode}: ${err.message}`, {
        traceId,
        details: err.details,
      });
      res.status(statusCode).json({
        success: false,
        status: statusCode,
        message: err.message,
        ...(err.details !== undefined && { errors: err.details }),
        ...(traceId && { traceId }),
      });
      return;
    }

    // 5xx — log at error level for alerting
    logger.error(`${statusCode}: ${err.message}`, {
      traceId,
      stack: err.stack,
    });
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      message: "Internal server error",
      ...(traceId && { traceId }),
    });
    return;
  }

  // Unknown error — treat as 500
  logger.error("Unhandled error", {
    traceId,
    err: err instanceof Error ? err.stack : String(err),
  });
  res.status(500).json({
    success: false,
    status: 500,
    message: "Internal server error",
    ...(traceId && { traceId }),
  });
}
