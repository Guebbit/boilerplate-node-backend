import morgan from "morgan";
import type { Handler } from "express";
import { logger } from "../utils/winston";

const isProduction = process.env.NODE_ENV === "production";

/**
 * HTTP request logger middleware.
 * - Dev: coloured "dev" format via morgan → human-readable
 * - Prod: JSON-compatible "combined" format piped through Winston
 */
export function requestLogger(): Handler {
  if (isProduction) {
    const stream = {
      write: (message: string) =>
        logger.http(message.trimEnd()),
    };
    return morgan("combined", { stream }) as Handler;
  }

  // Developer-friendly coloured output
  return morgan("dev") as Handler;
}
